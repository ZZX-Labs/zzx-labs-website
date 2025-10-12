// static/js/modules/music-player/cors.js
// Lightweight AllOrigins CORS helpers for front-end-only use.
// Usage:
//   import { fetchTextViaProxy, fetchJSONViaProxy, corsWrap } from './cors.js';
//   const txt = await fetchTextViaProxy(url, 'allorigins-raw');
//   const j   = await fetchJSONViaProxy(url, 'allorigins-json');

const AO_BASE = 'https://api.allorigins.win';

/* internal helper */
function wrapAllOrigins(url, mode) {
  const enc = encodeURIComponent(url);
  const noCache = '&disableCache=true';
  if (mode === 'json') return `${AO_BASE}/get?url=${enc}${noCache}`;
  return `${AO_BASE}/raw?url=${enc}${noCache}`;
}

/**
 * corsWrap(proxy, url, prefer?)
 * Resolves a full fetchable URL given a proxy keyword or prefix.
 *
 * Recognized proxy keywords:
 *  - "allorigins", "allorigins-raw"  → raw passthrough
 *  - "allorigins-json"               → JSON wrapper { contents, status }
 *  - any other string                → treated as prefix (old behavior)
 *  - falsy                           → returns original URL
 */
export function corsWrap(proxy, url, prefer = 'raw') {
  if (!url) return '';
  if (!proxy) return url;

  const p = String(proxy).toLowerCase();
  if (p === 'allorigins' || p === 'allorigins-raw') return wrapAllOrigins(url, 'raw');
  if (p === 'allorigins-json')                      return wrapAllOrigins(url, 'json');

  // Back-compat: prefix style proxy (“https://example.com/?”)
  return proxy.includes('?')
    ? (proxy + encodeURIComponent(url))
    : (proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, ''));
}

/* ------------------- Fetchers ------------------- */

export async function fetchTextViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // Try RAW → plain text
    try {
      const rawUrl = corsWrap('allorigins-raw', url);
      const r = await fetch(rawUrl, { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch {}

    // Fallback: JSON endpoint → .contents
    try {
      const jsonUrl = corsWrap('allorigins-json', url);
      const r = await fetch(jsonUrl, { cache: 'no-store' });
      if (!r.ok) return '';
      const j = await r.json();
      return String(j?.contents || '');
    } catch {}
    return '';
  }

  // Non-AllOrigins proxy
  try {
    const r = await fetch(corsWrap(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
}

export async function fetchJSONViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // Try RAW → parse as JSON
    try {
      const r = await fetch(corsWrap('allorigins-raw', url), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}

    // Fallback: JSON wrapper → parse contents field
    try {
      const r = await fetch(corsWrap('allorigins-json', url), { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      const txt = j?.contents || '';
      if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    } catch {}
    return null;
  }

  // Non-AllOrigins proxy
  try {
    const r = await fetch(corsWrap(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
