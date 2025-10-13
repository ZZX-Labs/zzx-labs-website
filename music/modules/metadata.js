// /music/modules/metadata.js
// Clean SomaFM + universal now-playing (Soma => channels.json ONLY)
import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* --------------------------------------------------------------------------
 * SomaFM via channels.json (authoritative + listeners)
 * -------------------------------------------------------------------------- */
const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // cache 5s
let somaCache = { t: 0, rows: null };

const SOMA_HOST_RE = /\.(somafm\.com)$/i;
const SOMA_ICE_HOST_RE = /(^|\.)ice\d*\.(somafm\.com)$/i; // ice, ice1, ice2...

function toInt(v){ const n = parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : 0; }

function mapSomaRow(ch){
  return {
    id: (ch.id || '').toLowerCase(),
    title: ch.title || '',
    listeners: toInt(ch.listeners),
    lastPlaying: ch.lastPlaying || ''
  };
}

async function getSomaChannels(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(mapSomaRow) : null;
  if (rows) { somaCache = { t: now, rows }; return rows; }
  return somaCache.rows || []; // stale-if-error
}

/** Derive channel ID from variations: /groovesalad-256-mp3, /groovesalad256.pls, /groovesalad64, /secretagent.pls */
function somaIdFromUrl(u){
  try{
    const p = new URL(u, (typeof location !== 'undefined' ? location.href : 'https://example.com')).pathname.replace(/^\/+/, '');
    let id = (p.split('/')[0] || '');
    id = id.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, ''); // strip extension
    id = id
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, ''); // trailing bitrate
    if (id.includes('-')) id = id.split('-')[0]; // rare dashy variants
    return id.toLowerCase();
  } catch { return ''; }
}

async function fetchSomaMeta(streamUrl, proxy){
  const id = somaIdFromUrl(streamUrl);
  if (!id) return null;
  const rows = await getSomaChannels(proxy);
  const r = rows.find(ch => ch.id === id);
  if (!r) return null;
  const label = normalizeNow(r.lastPlaying || '');
  // Paranoid guard: never show donate-y promos even if they slip in somehow
  const clean = /donate/i.test(label) ? '' : label;
  return { title: r.title || `SomaFM • ${id}`, now: clean, listeners: r.listeners };
}

/* --------------------------------------------------------------------------
 * Universal probe for NON-Soma (Icecast / Shoutcast / Radio.co)
 * -------------------------------------------------------------------------- */
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

async function fetchUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, (typeof location !== 'undefined' ? location.href : 'https://example.com'));
    // Never probe Soma via ICY — that’s where the “Donate …” text comes from.
    if (SOMA_HOST_RE.test(u.hostname) || SOMA_ICE_HOST_RE.test(u.hostname)) return null;

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
            const label = normalizeNow(now);
            if (label && !/donate/i.test(label)) return { title, now: label };
          }
        }
        // Shoutcast v2
        if (j.servertitle || j.songtitle){
          const label = normalizeNow(j.songtitle || '');
          if (label && !/donate/i.test(label)) return { title: j.servertitle || '', now: label };
        }
        // Radio.co
        if (j.current_track || j.name){
          const now = j.current_track?.title_with_artists || j.current_track?.title || '';
          const label = normalizeNow(now);
          if (label && !/donate/i.test(label)) return { title: j.name || '', now: label };
        }
      } else {
        // Shoutcast v1 /7.html
        const t = await fetchTextViaProxy(url, proxy);
        if (!t) continue;
        const m = t.match(/<body[^>]*>([^<]*)<\/body>/i) || t.match(/(.*,){6}(.+)/);
        if (m){
          const parts = String(m[1] || m[2] || '').split(',');
          const song = (parts.pop() || '').trim();
          const label = normalizeNow(song);
          if (label && !/donate/i.test(label)) return { title: '', now: label };
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

  // Treat both somafm.com and ice*.somafm.com as SomaFM (channels.json only)
  try{
    const host = new URL(url, (typeof location !== 'undefined' ? location.href : 'https://example.com')).hostname;
    if (SOMA_HOST_RE.test(host) || SOMA_ICE_HOST_RE.test(host)){
      const s = await fetchSomaMeta(url, proxy);
      // Even if no match, never fall back to ICY for Soma
      return s || null;
    }
  } catch {}

  // Non-Soma hosts: universal probing
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
