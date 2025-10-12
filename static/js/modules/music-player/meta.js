// static/js/modules/music-player/meta.js
// Universal now-playing metadata helpers (Icecast/Shoutcast/Radio.co) + SomaFM
// - For SomaFM: use channels.json (accurate now-playing + listeners).
// - Never probe SomaFM ICY endpoints (prevents "Donate…" messages).

import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ----------------------------------------------------------------------------
 * SomaFM live metadata (channels.json)
 * ------------------------------------------------------------------------- */

const SOMA_URL     = 'https://somafm.com/channels.json';
const SOMA_TTL_MS  = 5000; // 5s cache to match your polling cadence

let _soma = { t: 0, rows: null };

function toInt(v){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function liteRow(ch){
  return {
    id:          String(ch.id || '').toLowerCase(),
    title:       String(ch.title || ''),
    listeners:   toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || '')
  };
}

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (_soma.rows && (now - _soma.t) < SOMA_TTL_MS) return _soma.rows;

  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(liteRow) : null;

  if (rows) { _soma = { t: now, rows }; return rows; }
  // stale-if-error
  return _soma.rows || null;
}

/** Derive SomaFM channel id from stream URL like "/groovesalad-256-mp3" */
function somaIdFromUrl(streamUrl){
  try{
    const u = new URL(streamUrl, location.href);
    const seg = String(u.pathname || '').replace(/^\/+/, '').split('/')[0] || '';
    if (!seg) return '';
    // strip extension
    let id = seg.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '');
    // strip common bitrate/codec suffixes
    id = id.replace(/-(320|256|192|160|130|128|112|96|80|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '');
    // very rare: extra dashes
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  } catch { return ''; }
}

/** Get SomaFM metadata (title, now, listeners) by stream URL or hinted id */
async function fetchSomaMeta({ streamUrl, hintId }, proxy){
  const id = String(hintId || somaIdFromUrl(streamUrl) || '').toLowerCase();
  if (!id) return null;
  const rows = await fetchSomaChannels(proxy);
  const row = rows?.find(r => r.id === id);
  if (!row) return null;

  return {
    title: row.title || `SomaFM • ${id}`,
    now: normalizeNow(row.lastPlaying || ''),
    listeners: row.listeners
  };
}

/* ----------------------------------------------------------------------------
 * Universal (probe by stream host) — used for non-Soma
 * ------------------------------------------------------------------------- */

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

export async function fetchStreamMetaUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);

    // Do NOT probe SomaFM via ICY status; stick to channels.json only.
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON (if match)
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const looksJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      if (looksJson){
        const data = await fetchJSONViaProxy(url, proxy);
        if (!data) continue;

        // Icecast JSON
        if (typeof data === 'object' && data.icestats) {
          const src = data.icestats.source;
          const arr = Array.isArray(src) ? src : (src ? [src] : []);
          const hit = arr?.[0];
          if (hit) {
            const title = hit.server_name || hit.title || '';
            const now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}` : (hit.title || '');
            const norm  = normalizeNow(now);
            if (title || norm) return { title, now: norm };
          }
        }
        // Shoutcast v2 JSON
        if (data?.servertitle || data?.songtitle) {
          return { title: data.servertitle || '', now: normalizeNow(data.songtitle || '') };
        }
        // Radio.co JSON
        if (data?.current_track || data?.name) {
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title: data.name || '', now: normalizeNow(now) };
        }
      } else {
        // Shoutcast v1: /7.html
        const txt = await fetchTextViaProxy(url, proxy);
        if (!txt) continue;
        const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
        if (m) {
          const parts = String(m[1] || m[2] || '').split(',');
          const song = parts.pop()?.trim();
          if (song) return { title: '', now: normalizeNow(song) };
        }
      }
    }
  } catch {}
  return null;
}

/* ----------------------------------------------------------------------------
 * Specific adapters (kept for manifest back-compat if present)
 * ------------------------------------------------------------------------- */

export async function metaRadioCo(meta, proxy){
  const url = meta?.status || (meta?.station_id ? `https://public.radio.co/stations/${meta.station_id}/status` : '');
  if (!url) return null;
  const j = await fetchJSONViaProxy(url, proxy);
  if (!j) return null;
  const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
  const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
  return { title: meta?.name || '', now: normalizeNow([a,t].filter(Boolean).join(' - ')) };
}

export async function metaShoutcast(meta, proxy){
  if (!meta?.status) return null;
  const txt = await fetchTextViaProxy(meta.status, proxy);
  if (!txt) return null;
  const parts = txt.split(',').map(s=>s.trim());
  const cur = parts[parts.length-1] || '';
  return { title: 'Shoutcast', now: normalizeNow(cur) };
}

/* ----------------------------------------------------------------------------
 * Orchestrator
 * ------------------------------------------------------------------------- */
/**
 * Try SomaFM first (by host or kind), else universal probing, else declared kind.
 * Returns object that may include { listeners } for SomaFM.
 *
 * @param {string} streamUrl - actual playing URL
 * @param {{kind?:'somafm'|'radioco'|'shoutcast', id?:string, channel?:string, channelId?:string, status?:string, station_id?:string, name?:string}} stationMeta
 * @param {string} proxy - "allorigins-raw" | "allorigins-json" | custom prefix | ''
 */
export async function fetchNowPlaying(streamUrl, stationMeta, proxy){
  // 1) SomaFM by explicit kind or by hostname
  try{
    const u = streamUrl ? new URL(streamUrl, location.href) : null;
    const isSomaByHost = !!u && /\.somafm\.com$/i.test(u.hostname);
    const somaHintId = (stationMeta?.id || stationMeta?.channel || stationMeta?.channelId || '').toLowerCase();

    if (isSomaByHost || stationMeta?.kind === 'somafm') {
      const soma = await fetchSomaMeta({ streamUrl, hintId: somaHintId }, proxy);
      if (soma && (soma.now || soma.title)) return soma;
      // If it’s Soma host but we didn’t find a row, do NOT fall back to ICY probing.
      if (isSomaByHost) return null;
    }
  } catch {}

  // 2) Non-Soma: generic host probing
  if (streamUrl){
    const uni = await fetchStreamMetaUniversal(streamUrl, proxy);
    if (uni && (uni.now || uni.title)) return uni;
  }

  // 3) Manifest-declared fallbacks (back-compat)
  if (stationMeta?.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy);
  if (stationMeta?.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy);

  return null;
}
