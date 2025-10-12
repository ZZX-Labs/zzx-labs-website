// static/js/modules/music-player/meta.js
// Universal now-playing metadata helpers (Icecast/Shoutcast/Radio.co/SomaFM)
import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ---------- Universal (probe by stream host) ---------- */
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

export async function fetchStreamMetaUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);
    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON (if match)
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      // Heuristic: JSON endpoints vs /7.html
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

/* ---------- Specific adapters (when manifest gives kind/meta) ---------- */
export async function metaRadioCo(meta, proxy){
  const url = meta?.status || (meta?.station_id ? `https://public.radio.co/stations/${meta.station_id}/status` : '');
  if (!url) return null;
  const j = await fetchJSONViaProxy(url, proxy);
  if (!j) return null;
  const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
  const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
  return { title: meta?.name || '', now: normalizeNow([a,t].filter(Boolean).join(' - ')) };
}

export async function metaSomaFM(meta, proxy){
  if (!meta?.status) return null;
  const j = await fetchJSONViaProxy(meta.status, proxy);
  const first = Array.isArray(j) ? j[0] : null;
  if (!first) return null;
  const t = first?.title || '';
  const a = first?.artist || '';
  return { title: meta?.channel ? `SomaFM • ${meta.channel}` : 'SomaFM', now: normalizeNow([a,t].filter(Boolean).join(' - ')) };
}

export async function metaShoutcast(meta, proxy){
  if (!meta?.status) return null;
  const txt = await fetchTextViaProxy(meta.status, proxy);
  if (!txt) return null;
  const parts = txt.split(',').map(s=>s.trim());
  const cur = parts[parts.length-1] || '';
  return { title: 'Shoutcast', now: normalizeNow(cur) };
}

/**
 * Try stream-host probing first, then manifest-declared adapter as fallback.
 * @param {string} streamUrl - actual playing URL (for probing)
 * @param {{kind?:string, status?:string, station_id?:string, channel?:string, name?:string}} stationMeta
 * @param {string} proxy - "allorigins-raw" | "allorigins-json" | custom prefix | ''
 */
export async function fetchNowPlaying(streamUrl, stationMeta, proxy){
  let info = null;
  if (streamUrl) info = await fetchStreamMetaUniversal(streamUrl, proxy);
  if (info && (info.now || info.title)) return info;

  if (stationMeta?.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy);
  if (stationMeta?.kind === 'somafm')    return await metaSomaFM(stationMeta, proxy);
  if (stationMeta?.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy);

  return null;
}
