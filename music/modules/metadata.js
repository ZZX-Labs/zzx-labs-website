// metadata.js — clean SomaFM + universal now-playing
import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

/* --------------------------------------------------------------------------
 * SomaFM
 * -------------------------------------------------------------------------- */
const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // 5s cache
let somaCache = { t: 0, rows: null };

async function getSomaChannels(proxy) {
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;

  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels)
    ? j.channels.map(ch => ({
        id: (ch.id || '').toLowerCase(),
        title: ch.title || '',
        listeners: parseInt(ch.listeners || 0, 10),
        now: ch.lastPlaying || ''
      }))
    : [];

  if (rows.length) somaCache = { t: now, rows };
  return rows;
}

/** Derive SomaFM channel id from stream URL like /groovesalad-256-mp3 */
function somaIdFromUrl(u) {
  try {
    const x = new URL(u, location.href).pathname.replace(/^\/+/, '');
    let id = x.split('/')[0];
    id = id.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '')
           .replace(/-(256|192|128|64)(-(mp3|aacp?|ogg))?$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  } catch { return ''; }
}

/** Get SomaFM metadata (title, now, listeners) */
async function fetchSomaMeta(streamUrl, proxy) {
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
 * Fallback Universal Probe (non-Soma)
 * -------------------------------------------------------------------------- */
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

async function fetchUniversal(streamUrl, proxy) {
  try {
    const u = new URL(streamUrl, location.href);
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),
      corsWrap(proxy, `${base}/status.xsl?json=1`),
      corsWrap(proxy, `${base}/stats?sid=1&json=1`),
      corsWrap(proxy, `${base}/7.html`)
    ];

    for (const c of candidates) {
      if (c.endsWith('.xsl') || c.includes('json=1')) {
        const j = await fetchJSONViaProxy(c, proxy);
        if (j?.icestats) {
          const s = Array.isArray(j.icestats.source) ? j.icestats.source[0] : j.icestats.source;
          if (s) return { title: s.server_name || '', now: normalizeNow(s.title || s.server_description || '') };
        }
        if (j?.servertitle || j?.songtitle)
          return { title: j.servertitle || '', now: normalizeNow(j.songtitle || '') };
      } else {
        const t = await fetchTextViaProxy(c, proxy);
        if (t && !/Donate to SomaFM/i.test(t)) {
          const m = t.match(/<body[^>]*>([^<]*)<\/body>/i) || t.match(/(.*,){6}(.+)/);
          if (m) return { title: '', now: normalizeNow(m[1] || m[2] || '') };
        }
      }
    }
  } catch {}
  return null;
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */
export async function fetchStreamMeta(url, proxy) {
  if (!url) return null;
  // SomaFM first
  const soma = await fetchSomaMeta(url, proxy);
  if (soma) return soma;
  // Otherwise, generic
  return await fetchUniversal(url, proxy);
}

/* --------------------------------------------------------------------------
 * Lightweight file-based meta
 * -------------------------------------------------------------------------- */
export async function fetchTrackMeta(tr) {
  const src = tr?.title || tr?.url || '';
  const [artist, title] = splitArtistTitle(src);
  const now = normalizeNow([artist, title].filter(Boolean).join(' - '));
  return now ? { artist, title: title || now } : null;
}

/* --------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */
function splitArtistTitle(s) {
  const m = String(s).split(/ - (.+)/);
  return m.length >= 3 ? [m[0].trim(), m[1].trim()] : ['', s.trim()];
}
