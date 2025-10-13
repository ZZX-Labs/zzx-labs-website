// /music/modules/cors.js — tiny CORS helpers using AllOrigins
// Usage:
//   import { fetchTextViaProxy, fetchJSONViaProxy, corsWrap } from './cors.js';
//   const txt = await fetchTextViaProxy(url, proxy); // proxy: "allorigins-raw" | "allorigins-json" | custom prefix
//   const j   = await fetchJSONViaProxy(url, proxy);

const AO_BASE = 'https://api.allorigins.win';
const DEFAULT_TIMEOUT_MS = 9000;

function wrapAllOrigins(url, mode) {
  const enc = encodeURIComponent(url);
  // disable AllOrigins cache for "live" endpoints
  if (mode === 'json') return `${AO_BASE}/get?url=${enc}&disableCache=true`;
  // mode === 'raw'
  return `${AO_BASE}/raw?url=${enc}&disableCache=true`;
}

/**
 * Generic wrapper that understands:
 *  - "allorigins", "allorigins-raw"  -> raw passthrough
 *  - "allorigins-json"               -> JSON wrapper { contents, status }
 *  - Any other string                -> treated as prefix (old behavior)
 *  - falsy                           -> no proxy
 */
export function corsWrap(proxy, url, prefer = 'raw') {
  if (!url) return '';
  if (!proxy) return url;

  const p = String(proxy).toLowerCase();
  if (p === 'allorigins' || p === 'allorigins-raw') return wrapAllOrigins(url, 'raw');
  if (p === 'allorigins-json')                      return wrapAllOrigins(url, 'json');

  // Back-compat: prefix-based proxy ("https://example.com/?")
  return proxy.includes('?')
    ? (proxy + encodeURIComponent(url))
    : (proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, ''));
}

/* ------------------- internals ------------------- */

async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    const r = await fetch(input, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache, no-store, must-revalidate',
        'pragma': 'no-cache',
        'expires': '0',
        ...(init.headers || {})
      },
      ...init,
      signal: ctrl.signal
    });
    return r;
  } catch {
    return { ok: false, status: 0, text: async ()=>'',
             json: async ()=>null };
  } finally {
    clearTimeout(id);
  }
}

/* ------------------- Fetchers (use these) ------------------- */

export async function fetchTextViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // raw -> text
    const rawUrl = corsWrap('allorigins-raw', url);
    try {
      const r = await fetchWithTimeout(rawUrl);
      if (r.ok) return String(await r.text() ?? '');
    } catch {}

    // fallback: JSON endpoint -> .contents
    const jsonUrl = corsWrap('allorigins-json', url);
    try {
      const r = await fetchWithTimeout(jsonUrl);
      if (!r.ok) return '';
      const j = await r.json();
      return String(j?.contents || '');
    } catch {}
    return '';
  }

  // Non-AllOrigins path/prefix
  try {
    const r = await fetchWithTimeout(corsWrap(proxy, url, 'raw'));
    return r.ok ? String(await r.text() ?? '') : '';
  } catch { return ''; }
}

export async function fetchJSONViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // Try RAW first and parse as JSON (works if target sends application/json)
    try {
      const r = await fetchWithTimeout(corsWrap('allorigins-raw', url));
      if (r.ok) return await r.json();
    } catch {}

    // Fallback: AllOrigins JSON wrapper -> parse contents
    try {
      const r = await fetchWithTimeout(corsWrap('allorigins-json', url));
      if (!r.ok) return null;
      const j = await r.json();
      const txt = j?.contents || '';
      if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    } catch {}
    return null;
  }

  // Non-AllOrigins path/prefix
  try {
    const r = await fetchWithTimeout(corsWrap(proxy, url, 'raw'));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
