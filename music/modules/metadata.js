// /music/modules/metadata.js
// Clean SomaFM + universal now-playing
import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* --------------------------------------------------------------------------
 * SomaFM via channels.json
 * -------------------------------------------------------------------------- */
const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // cache for 5s
let somaCache = { t: 0, rows: null };

function toInt(v){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapSomaRow(ch){
  return {
    id: (ch.id || '').toLowerCase(),
    title: ch.title || '',
    listeners: toInt(ch.listeners),
    now: ch.lastPlaying || ''
  };
}

async function getSomaChannels(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;

  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(mapSomaRow) : null;

  if (rows && rows.length){
    somaCache = { t: now, rows };
    return rows;
  }
  // stale-if-error
  return somaCache.rows || [];
}

/** Derive SomaFM channel id from URLs like:
 *   /groovesalad-256-mp3
 *   /groovesalad256.pls
 *   /groovesalad64
 *   /secretagent.pls
 */
function somaIdFromUrl(u){
  try{
    const p = new URL(u, location.href).pathname.replace(/^\/+/, '');
    let id = (p.split('/')[0] || '');

    // strip extension if any
    id = id.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '');

    // strip common bitrate/codec suffixes (covers -256-mp3, -130-aac, trailing numbers, etc.)
    id = id
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');

    // very rare: extra dashes (e.g., "groovesalad-extra-256-mp3") → keep first token
    if (id.includes('-')) id = id.split('-')[0];

    return id.toLowerCase();
  } catch { return ''; }
}

async function fetchSomaMeta(streamUrl, proxy){
  const id = somaIdFromUrl(streamUrl);
  if (!id) return null;

  const rows = await getSomaChannels(proxy);
  const r = rows.find(ch => ch.id === id);
  if (!r) return null;

  return {
    title: r.title || `SomaFM • ${id}`,
    now: normalizeNow(r.now || ''),
    listeners: r.listeners
  };
}

/* --------------------------------------------------------------------------
 * Universal probe for non-Soma (Icecast / Shoutcast / Radio.co)
 * -------------------------------------------------------------------------- */
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

async function fetchUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);
    // Never probe SomaFM via ICY (prevents “Donate…” titles)
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Icecast alt JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const looksJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      if (looksJson){
        const j = await fetchJSONViaProxy(url, proxy);
        if (!j) continue;

        // Icecast
        if (j.icestats){
          const src = Array.isArray(j.icestats.source) ? j.icestats.source[0] : j.icestats.source;
          if (src){
            const title = src.server_name || src.title || '';
            const now = src.artist && src.title ? `${src.artist} - ${src.title}` : (src.title || '');
            return { title, now: normalizeNow(now) };
          }
        }
        // Shoutcast v2
        if (j.servertitle || j.songtitle){
          return { title: j.servertitle || '', now: normalizeNow(j.songtitle || '') };
        }
        // Radio.co
        if (j.current_track || j.name){
          const now = j.current_track?.title_with_artists || j.current_track?.title || '';
          return { title: j.name || '', now: normalizeNow(now) };
        }
      } else {
        // Shoutcast v1 /7.html
        const t = await fetchTextViaProxy(url, proxy);
        if (!t) continue;
        const m = t.match(/<body[^>]*>([^<]*)<\/body>/i) || t.match(/(.*,){6}(.+)/);
        if (m){
          const parts = String(m[1] || m[2] || '').split(',');
          const song = parts.pop()?.trim();
          if (song) return { title: '', now: normalizeNow(song) };
        }
      }
    }
  } catch {}
  return null;
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */
export async function fetchStreamMeta(url, proxy){
  if (!url) return null;

  // 1) If SomaFM host, use channels.json (accurate + listeners)
  try{
    const host = new URL(url, location.href).hostname;
    if (/\.somafm\.com$/i.test(host)){
      const s = await fetchSomaMeta(url, proxy);
      if (s) return s;
      // if not found, still avoid ICY probing to prevent donate messages
      return null;
    }
  } catch {}

  // 2) Non-Soma
  return await fetchUniversal(url, proxy);
}

/* --------------------------------------------------------------------------
 * Lightweight file-based meta (for non-stream tracks)
 * -------------------------------------------------------------------------- */
export async function fetchTrackMeta(tr){
  const src = tr?.title || tr?.url || '';
  const [artist, title] = splitArtistTitle(src);
  const now = normalizeNow([artist, title].filter(Boolean).join(' - '));
  return now ? { artist, title: title || now } : null;
}

/* --------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */
function splitArtistTitle(s){
  const m = String(s || '').split(/ - (.+)/);
  return m.length >= 3 ? [m[0].trim(), m[1].trim()] : ['', String(s || '').trim()];
}
