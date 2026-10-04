// static/js/modules/music-player/cors.js
// AllOrigins front-end CORS helpers — no backend required.
//
// import { fetchTextViaProxy, fetchJSONViaProxy, corsWrap } from './cors.js'
// const txt = await fetchTextViaProxy(url, 'allorigins-raw')
// const j   = await fetchJSONViaProxy(url, 'allorigins-json')

const AO_BASE = 'https://api.allorigins.win';

/* internal helper */
function wrapAllOrigins(url, mode = 'raw') {
  const enc = encodeURIComponent(url);
  const noCache = '&disableCache=true';
  return mode === 'json'
    ? `${AO_BASE}/get?url=${enc}${noCache}`
    : `${AO_BASE}/raw?url=${enc}${noCache}`;
}

/**
 * corsWrap(proxy, url, prefer?)
 *  - "allorigins", "allorigins-raw" → raw passthrough
 *  - "allorigins-json"              → JSON wrapper { contents, status }
 *  - other string                   → treated as prefix
 *  - falsy                          → returns original URL
 */
export function corsWrap(proxy, url, prefer = 'raw') {
  if (!url) return '';
  if (!proxy) return url;

  const p = String(proxy).toLowerCase();
  if (p === 'allorigins' || p === 'allorigins-raw') return wrapAllOrigins(url, 'raw');
  if (p === 'allorigins-json')                      return wrapAllOrigins(url, 'json');

  // legacy prefix form
  return proxy.includes('?')
    ? proxy + encodeURIComponent(url)
    : proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, '');
}

/* ---------------- Fetchers ---------------- */

export async function fetchTextViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();

  // AllOrigins
  if (p.startsWith('allorigins')) {
    try {
      const r = await fetch(wrapAllOrigins(url, 'raw'), { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch {}

    try {
      const r = await fetch(wrapAllOrigins(url, 'json'), { cache: 'no-store' });
      if (!r.ok) return '';
      const j = await r.json();
      return String(j?.contents || '');
    } catch {}
    return '';
  }

  // Custom proxy or direct fetch
  try {
    const r = await fetch(corsWrap(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
}

export async function fetchJSONViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();

  // AllOrigins
  if (p.startsWith('allorigins')) {
    try {
      const r = await fetch(wrapAllOrigins(url, 'raw'), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}

    try {
      const r = await fetch(wrapAllOrigins(url, 'json'), { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      const txt = j?.contents || '';
      return txt ? JSON.parse(txt) : null;
    } catch {}
    return null;
  }

  // Custom proxy or direct fetch
  try {
    const r = await fetch(corsWrap(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
