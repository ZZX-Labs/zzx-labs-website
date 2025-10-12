// /music/modules/metadata.js — front-end public metadata fetchers (AllOrigins-ready)
import { normalizeNow } from './utils.js';
import { corsWrap, fetchTextViaProxy, fetchJSONViaProxy } from './cors.js';

/**
 * Fetch and parse stream metadata for live radio URLs.
 * Tries Shoutcast, Icecast, and Radio.co endpoints via AllOrigins.
 */
export async function fetchStreamMeta(streamUrl, proxy){
  if (!streamUrl) return null;

  const endpoints = [
    streamUrl.replace(/\/+$/, '') + '/status-json.xsl',   // Icecast JSON
    streamUrl.replace(/\/+$/, '') + '/stats?json',        // Shoutcast v2
    streamUrl.replace(/\/+$/, '') + '/status.xsl',        // Shoutcast HTML
  ];

  for (const ep of endpoints){
    try {
      const json = await fetchJSONViaProxy(ep, proxy);
      if (json){
        // Icecast-style
        const src = json.icestats?.source;
        if (src){
          const title = Array.isArray(src) ? src[0]?.title : src.title;
          if (title) return { title: normalizeNow(title), now: normalizeNow(title) };
        }
        // Shoutcast v2
        const song = json.songtitle || json.currenttrack || json.title;
        if (song) return { title: normalizeNow(song), now: normalizeNow(song) };
      }
    } catch {}

    // HTML fallback: parse <td>Current Song</td><td>Artist - Title</td>
    try {
      const html = await fetchTextViaProxy(ep, proxy);
      const m = html.match(/Current\s*Song[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
      if (m) return { title: normalizeNow(m[1]), now: normalizeNow(m[1]) };
    } catch {}
  }

  // Radio.co API variant
  try {
    const m = streamUrl.match(/streaming\.radioco\.([a-z0-9.-]+)\/([^/]+)/i);
    if (m){
      const j = await fetchJSONViaProxy(`https://public.radio.co/stations/${m[2]}/status`, proxy);
      if (j?.current_track?.title) return { title: normalizeNow(j.current_track.title), now: normalizeNow(j.current_track.title) };
    }
  } catch {}

  return null;
}

/**
 * Fetch and parse track metadata for static playlist items (.mp3, .ogg, .flac)
 * Attempts ID3/Ogg tags via HTTP metadata JSON endpoints or sidecar .json files.
 */
export async function fetchTrackMeta(track, proxy){
  if (!track?.url) return null;
  const base = track.url.replace(/\.[a-z0-9]+$/i, '');

  // 1. Try explicit sidecar .json (preferred)
  try {
    const meta = await fetchJSONViaProxy(base + '.json', proxy);
    if (meta?.title || meta?.artist) return meta;
  } catch {}

  // 2. Try same URL with ?meta=1 or /meta.json
  for (const p of [track.url + '?meta=1', base + '/meta.json']){
    try {
      const meta = await fetchJSONViaProxy(p, proxy);
      if (meta?.title || meta?.artist) return meta;
    } catch {}
  }

  // 3. Fallback: infer from filename
  try {
    const name = decodeURIComponent(track.url.split('/').pop() || '');
    const clean = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_+]/g, ' ');
    const parts = clean.split(' - ');
    if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
    return { title: clean };
  } catch {}

  return null;
}
