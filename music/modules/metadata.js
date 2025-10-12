// /music/modules/metadata.js
// Universal now-playing metadata (Icecast/Shoutcast/Radio.co) + SomaFM channels.json
import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ----------------------------------------------------------------------------
 * SomaFM live metadata (channels.json)
 * ------------------------------------------------------------------------- */

const SOMA_URL     = 'https://somafm.com/channels.json';
const SOMA_REFRESH = 5000; // poll caller every ~5s; keep TTL about the same

let _somaCache = { t: 0, rows: null };

function toInt(v){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function pickLite(ch){
  return {
    id:          String(ch.id || ''),
    title:       String(ch.title || ''),
    listeners:   toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || '')
  };
}

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (_somaCache.rows && (now - _somaCache.t) < SOMA_REFRESH) return _somaCache.rows;

  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(pickLite) : null;

  if (rows) {
    _somaCache = { t: now, rows };
    return rows;
  }
  // stale-if-error: return previous rows if available
  return _somaCache.rows || null;
}

/** Derive Soma channel id from a typical stream URL path like "/groovesalad-256-mp3" */
function somaIdFromUrl(urlString){
  try {
    const u = new URL(urlString, location.href);
    const seg = String(u.pathname || '').replace(/^\/+/, '').split('/')[0] || '';
    if (!seg) return '';
    // remove extension (mp3/aac/aacp/ogg/pls/m3u8)
    let base = seg.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '');
    // drop common bitrate/codec suffixes like "-256-mp3", "-130-aac", "-64", etc.
    base = base.replace(/-(256|320|192|160|130|128|112|96|80|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '');
    // if still dashed (extremely rare for Soma IDs), take the first token
    if (base.includes('-')) base = base.split('-')[0];
    return base.toLowerCase();
  } catch {
    return '';
  }
}

/* ----------------------------------------------------------------------------
 * Universal (probe by stream host) — used for non-Soma stations
 * ------------------------------------------------------------------------- */

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

async function fetchStreamMetaUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);

    // Do NOT probe SomaFM via ICY status (titles contain "Donate…" promos).
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
 * Public API (used by player.js)
 * ------------------------------------------------------------------------- */

/**
 * Fetch now-playing for the given stream URL.
 * - For SomaFM streams, use channels.json (accurate + includes listeners).
 * - Otherwise, probe the stream host (Icecast/Shoutcast/Radio.co).
 *
 * Returns: { title, now, listeners? } or null
 */
export async function fetchStreamMeta(streamUrl, proxy){
  if (!streamUrl) return null;

  // 1) SomaFM: map to channel id and read from channels.json
  try{
    const u = new URL(streamUrl, location.href);
    if (/\.somafm\.com$/i.test(u.hostname)) {
      const id = somaIdFromUrl(streamUrl);
      if (id) {
        const rows = await fetchSomaChannels(proxy);
        const row = rows?.find(r => r.id.toLowerCase() === id.toLowerCase());
        if (row) {
          return {
            title: row.title || `SomaFM • ${id}`,
            now: normalizeNow(row.lastPlaying || ''),
            listeners: row.listeners
          };
        }
      }
    }
  } catch {}

  // 2) Non-Soma: universal probing
  return await fetchStreamMetaUniversal(streamUrl, proxy);
}

/**
 * Lightweight track meta for file-based playlists.
 * Tries to infer artist/title from either provided title or filename.
 */
export async function fetchTrackMeta(tr, _proxy){
  // If the M3U entry already contains a good title, attempt an artist/title split
  const src = String(tr?.title || '') || fileName(tr?.url || '');
  const [artist, title] = splitArtistTitle(src);
  const label = normalizeNow([artist, title].filter(Boolean).join(' - '));
  if (!label) return null;
  const [a, t] = label.includes(' - ') ? label.split(/ - (.+)/) : ['', label];
  return { artist: a || '', title: t || label };
}

/* --------------------------------- helpers -------------------------------- */

function fileName(u){
  try {
    const p = new URL(u, location.href).pathname;
    const b = p.split('/').pop() || '';
    return b.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g,' ').trim();
  } catch { return ''; }
}

function splitArtistTitle(s){
  const m = String(s || '').split(/ - (.+)/);
  if (m.length >= 3) return [m[0].trim(), m[1].trim()];
  return ['', s.trim()];
      }
