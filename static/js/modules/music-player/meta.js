// universal live metadata resolvers
import { corsWrap, normalizeNow, fetchJSON, fetchText } from './utils.js';

// Guess Radio.co status endpoint if only the stream URL is known
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

/** Pick the first real "song" from SomaFM JSON, skip donation / promo lines */
function pickSomaSong(arr){
  if (!Array.isArray(arr)) return null;
  const looksLikeSong = (obj) => {
    const a = (obj?.artist||'').trim();
    const t = (obj?.title||'').trim();
    if (!a && !t) return false;
    const s = `${a} ${t}`.toLowerCase();
    // skip obvious promos/donations
    if (/\bdonate|support|soma\s*fm|please\b/.test(s)) return false;
    return true;
  };
  for (const item of arr){
    if (looksLikeSong(item)) return item;
  }
  // fallback: first item even if promo
  return arr[0] || null;
}

/**
 * Probe the stream's host for Icecast/Shoutcast/Radio.co metadata.
 * This DOES NOT touch the audio element; only metadata endpoints (CORS-proxied if provided).
 */
export async function fetchStreamMetaUniversal(streamUrl, proxy){
  try {
    const u = new URL(streamUrl, location.href);
    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),     // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),   // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`),  // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),         // Radio.co JSON (if host contains sXXXXXXXXXX)
      corsWrap(proxy, `${base}/7.html`)               // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      const data = isJson ? await fetchJSON(url) : await fetchText(url);
      if (!data) continue;

      // Icecast JSON
      if (isJson && typeof data === 'object' && data.icestats) {
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
      if (isJson && (data?.servertitle || data?.songtitle)) {
        return { title: data.servertitle || '', now: normalizeNow(data.songtitle || '') };
      }

      // Radio.co JSON
      if (isJson && (data?.current_track || data?.name)) {
        const now = data.current_track?.title_with_artists || data.current_track?.title || '';
        return { title: data.name || '', now: normalizeNow(now) };
      }

      // Shoutcast v1 /7.html (sometimes returns <body>csv</body> or bare CSV)
      if (typeof data === 'string' && (url.endsWith('/7.html') || url.includes('/7.html?'))) {
        // Prefer the last field (current), but also guard for HTML
        const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
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

/* ---------- Optional explicit adapters when a station declares kind/meta ---------- */
function proxied(url, corsProxy){
  if (!corsProxy) return url;
  try {
    const u = new URL(url, location.origin);
    if (u.origin === location.origin) return url;
    return corsWrap(corsProxy, url);
  } catch { return url; }
}
export async function metaRadioCo(meta, corsProxy){
  const url = proxied(meta.status || `https://public.radio.co/stations/${meta.station_id}/status`, corsProxy);
  const j = await fetchJSON(url);
  if (!j) return null;
  const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
  const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
  return { now: normalizeNow([a,t].filter(Boolean).join(' - ')) || '', title: meta.name || '' };
}
export async function metaSomaFM(meta, corsProxy){
  const url = proxied(meta.status, corsProxy);
  const j = await fetchJSON(url);
  const first = pickSomaSong(Array.isArray(j) ? j : []);
  if (!first) return null;
  const t = first?.title || '';
  const a = first?.artist || '';
  return { now: normalizeNow([a,t].filter(Boolean).join(' - ')), title: (meta.channel ? `SomaFM • ${meta.channel}` : 'SomaFM') };
}
export async function metaShoutcast(meta, corsProxy){
  const url = proxied(meta.status, corsProxy);
  const txt = await fetchText(url);
  if (!txt) return null;
  const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
  let cur = '';
  if (m) {
    const parts = String(m[1] || m[2] || '').split(',');
    cur = parts.pop()?.trim() || '';
  } else {
    // fallback: last comma-field
    const parts = txt.split(',').map(s=>s.trim());
    cur = parts[parts.length-1] || '';
  }
  return { now: normalizeNow(cur), title: 'Shoutcast' };
}

/** Try explicit adapter, else universal probe */
export async function fetchLiveNow({ lastStreamUrl, stationMeta, proxy }){
  // 1) Universal probe from the actual audio host (best when CORS works via proxy)
  if (lastStreamUrl){
    const uni = await fetchStreamMetaUniversal(lastStreamUrl, proxy);
    if (uni?.now || uni?.title) return { now: uni.now || '', title: uni.title || '' };
  }
  // 2) Station-declared adapter as fallback
  if (stationMeta?.kind){
    try{
      if (stationMeta.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy) || null;
      if (stationMeta.kind === 'somafm')    return await metaSomaFM(stationMeta, proxy) || null;
      if (stationMeta.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy) || null;
    }catch{}
  }
  return null;
}
