// static/js/modules/music-player/meta.js
// Universal now-playing metadata helpers (Icecast/Shoutcast/Radio.co) + SomaFM
// - For SomaFM, read channels.json only (accurate now + listeners), never ICY.

import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ----------------------------------------------------------------------------
 * SomaFM (channels.json)
 * ------------------------------------------------------------------------- */

const SOMA_URL    = 'https://somafm.com/channels.json';
const SOMA_TTL_MS = 5000; // 5s cache to match your ticker

let _soma = { t: 0, rows: null };

const toInt = (v)=> {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

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
  return _soma.rows || null; // stale-if-error
}

/** Derive Soma channel id from a URL path or filename (very forgiving) */
function somaIdFromUrl(urlString){
  try{
    const u = new URL(urlString, location.href);
    const base = String(u.pathname || '').replace(/^\/+/, '').split('/')[0] || '';
    if (!base) return '';

    // strip extension
    let id = base.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '');

    // common forms:
    //   groovesalad-256-mp3  -> groovesalad
    //   groovesalad64        -> groovesalad
    //   groovesalad130-aac   -> groovesalad
    id = id
      .replace(/-(320|256|192|160|130|128|112|96|80|64|56|48|40|32)(-(mp3|aacp?|aac|ogg))?$/i, '')
      .replace(/(320|256|192|160|130|128|112|96|80|64|56|48|40|32)$/i, '');

    // if something weird like "groovesalad-foobar", take first token
    if (id.includes('-')) id = id.split('-')[0];

    return id.toLowerCase();
  } catch { return ''; }
}

/** Slug an arbitrary text (e.g., "SomaFM - Secret Agent" -> "secretagent") */
function slugToSomaId(name=''){
  const s = String(name || '').toLowerCase()
    .replace(/soma\s*fm|somafm|-\s*|–\s*|—\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return s;
}

async function fetchSomaMeta({ streamUrl, hintId, hintName }, proxy){
  const rows = await fetchSomaChannels(proxy);
  if (!rows || !rows.length) return null;

  const candidates = [];
  if (hintId)   candidates.push(String(hintId).toLowerCase());
  if (hintName) candidates.push(slugToSomaId(hintName));
  const fromUrl = somaIdFromUrl(streamUrl);
  if (fromUrl) candidates.push(fromUrl);

  const seen = new Set();
  for (const c of candidates){
    const id = (c || '').toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = rows.find(r => r.id === id);
    if (row) {
      return {
        title: row.title || `SomaFM • ${id}`,
        now: normalizeNow(row.lastPlaying || ''),
        listeners: row.listeners
      };
    }
  }

  // No id match → do NOT probe ICY for Soma. Return null (UI can keep last good or show em dash)
  return null;
}

/* ----------------------------------------------------------------------------
 * Universal probing (non-Soma only)
 * ------------------------------------------------------------------------- */

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

export async function fetchStreamMetaUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);

    // Hard-block SomaFM from ICY probing to avoid "Donate…" titles.
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON
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
 * Specific adapters (kept for legacy manifests)
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
 * Try SomaFM first (by host or explicit kind/name), else probe non-Soma,
 * else legacy adapters. Returns { title, now, listeners? }.
 *
 * @param {string} streamUrl
 * @param {{kind?:'somafm'|'radioco'|'shoutcast', id?:string, channel?:string, channelId?:string, name?:string, status?:string, station_id?:string}} stationMeta
 * @param {string} proxy
 */
export async function fetchNowPlaying(streamUrl, stationMeta, proxy){
  // 1) SomaFM first if host or declared
  try{
    const u = streamUrl ? new URL(streamUrl, location.href) : null;
    const isSomaHost = !!u && /\.somafm\.com$/i.test(u.hostname);
    const somaDeclared = stationMeta?.kind === 'somafm' || /somafm/i.test(stationMeta?.name || '');
    if (isSomaHost || somaDeclared) {
      const soma = await fetchSomaMeta({
        streamUrl,
        hintId: (stationMeta?.id || stationMeta?.channel || stationMeta?.channelId || '').toLowerCase(),
        hintName: stationMeta?.name || ''
      }, proxy);
      if (soma && (soma.now || soma.title)) return soma;
      // If it’s Soma, never fall back to ICY
      if (isSomaHost || somaDeclared) return null;
    }
  } catch {}

  // 2) Non-Soma: universal probing
  if (streamUrl){
    const uni = await fetchStreamMetaUniversal(streamUrl, proxy);
    if (uni && (uni.now || uni.title)) return uni;
  }

  // 3) Legacy adapters
  if (stationMeta?.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy);
  if (stationMeta?.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy);

  return null;
}
