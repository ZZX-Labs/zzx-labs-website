// /music/modules/metadata.js — stream + track metadata helpers
import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

/* -------------------------------------------------------------------------
   SomaFM live metadata (channels.json)
   ------------------------------------------------------------------------- */

const SOMA_URL = 'https://somafm.com/channels.json';
let _somaCache = { t: 0, data: null };
const SOMA_TTL_MS = 12_000; // refresh frequently but avoid hammering

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (_somaCache.data && (now - _somaCache.t) < SOMA_TTL_MS) return _somaCache.data;

  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const arr = Array.isArray(j?.channels) ? j.channels : null;
  if (arr) {
    _somaCache = { t: now, data: arr };
    return arr;
  }
  return _somaCache.data || null; // stale-if-error
}

function safeInt(v){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Reduce a SomaFM channel object to what the player needs. */
function toSomaLite(ch){
  return {
    id: String(ch.id || ''),
    title: String(ch.title || ''),
    listeners: safeInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || '')
  };
}

/**
 * Extract a SomaFM channel id from a stream path like:
 *   "/groovesalad-128-mp3" -> "groovesalad"
 *   "/u80s-64-aac"        -> "u80s"
 *   "/secretagent"        -> "secretagent"
 */
export function somaIdFromPath(pathname=''){
  const seg = String(pathname || '').replace(/^\/+/, '').split(/[/?#]/)[0] || '';
  // First run: take leading alphanumerics and digits (covers u80s, gsclassic, etc.)
  const id = (seg.match(/^([a-z0-9]+)/i)?.[1] || '').toLowerCase();
  return id;
}

/**
 * Given an array of SomaFM channel ids, return:
 *   [{ id, title, listeners, lastPlaying }]
 */
export async function fetchSomaByIds(ids, proxy){
  if (!Array.isArray(ids) || !ids.length) return [];
  const channels = await fetchSomaChannels(proxy);
  if (!channels) return [];
  const want = new Set(ids.map(s => String(s || '').toLowerCase()));
  return channels.filter(c => want.has(String(c.id || '').toLowerCase()))
                 .map(toSomaLite);
}

/**
 * Given an array of stream URLs, return SomaFM matches only:
 *   [{ id, title, listeners, lastPlaying }]
 * Non-Soma streams are ignored.
 */
export async function fetchSomaForStreams(streamUrls, proxy){
  if (!Array.isArray(streamUrls) || !streamUrls.length) return [];
  // Extract potential Soma ids from URLs that point at *.somafm.com
  const ids = streamUrls.map(u=>{
    try {
      const url = new URL(u, location.href);
      if (!/\.somafm\.com$/i.test(url.hostname)) return '';
      return somaIdFromPath(url.pathname);
    } catch { return ''; }
  }).filter(Boolean);

  if (!ids.length) return [];
  const channels = await fetchSomaChannels(proxy);
  if (!channels) return [];

  const byId = new Map(channels.map(c => [String(c.id || '').toLowerCase(), c]));
  const out = [];
  const seen = new Set();
  for (const id of ids){
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ch = byId.get(key);
    if (ch) out.push(toSomaLite(ch));
  }
  return out;
}

/* -------------------------------------------------------------------------
   Public API used by player.js
   ------------------------------------------------------------------------- */

/**
 * fetchStreamMeta(streamUrl, proxy)
 * - For SomaFM streams: returns { title, now, listeners }
 * - For non-Soma streams: returns null (avoid wrong ICY/“Donate…” text)
 */
export async function fetchStreamMeta(streamUrl, proxy){
  if (!streamUrl) return null;
  let url;
  try { url = new URL(streamUrl, location.href); }
  catch { return null; }

  // SomaFM special-case (don’t scrape ICY; use channels.json instead)
  if (/\.somafm\.com$/i.test(url.hostname)) {
    const id = somaIdFromPath(url.pathname);
    if (!id) return null;

    const channels = await fetchSomaChannels(proxy);
    if (!channels) return null;

    const ch = channels.find(c => String(c.id || '').toLowerCase() === id);
    if (!ch) return null;

    const now = normalizeNow(ch.lastPlaying || '');
    return {
      title: String(ch.title || 'SomaFM'),
      now: now || (ch.lastPlaying || '').trim() || '',
      listeners: safeInt(ch.listeners)
    };
  }

  // For other stations, either implement station-specific adapters here
  // or return null to avoid bogus fallback text from ICY intro/donate lines.
  return null;
}

/**
 * fetchTrackMeta(track, proxy)
 * - For local/playlist items, best-effort parse "Artist - Title" from track.title/filename.
 * - If you later add ID3 parsing, you can replace/enhance this.
 */
export async function fetchTrackMeta(track, proxy){
  // Prefer the given title from M3U, else derive from filename
  const raw = String(track?.title || track?.url || '').split('/').pop();
  const pretty = normalizeNow(raw);
  if (!pretty) return null;

  // Split once on the first " - " to get {artist, title}
  const i = pretty.indexOf(' - ');
  if (i > 0) {
    return {
      artist: pretty.slice(0, i).trim(),
      title:  pretty.slice(i + 3).trim()
    };
  }
  // If no dash found, return as title only
  return { artist: '', title: pretty };
}
