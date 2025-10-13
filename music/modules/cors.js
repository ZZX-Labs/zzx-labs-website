// /music/modules/cors.js — tiny CORS helpers (no custom headers; CORS-safe)
// Usage:
//   import { fetchTextViaProxy, fetchJSONViaProxy, corsWrap } from './cors.js';
//   const txt = await fetchTextViaProxy(url, proxy); // proxy: "allorigins-raw" | "allorigins-json" | custom prefix

const AO_BASE = 'https://api.allorigins.win';
const DEFAULT_TIMEOUT_MS = 9000;

function wrapAllOrigins(url, mode) {
  const enc = encodeURIComponent(url);
  if (mode === 'json') return `${AO_BASE}/get?url=${enc}&disableCache=true`;
  return `${AO_BASE}/raw?url=${enc}&disableCache=true`; // mode === 'raw'
}

/**
 * Optional proxy wrapper:
 *  - "allorigins", "allorigins-raw" -> raw passthrough
 *  - "allorigins-json"              -> JSON wrapper { contents, status }
 *  - Any other non-empty string     -> treated as prefix (old behavior)
 *  - falsy                          -> no proxy
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
      ...init,
      signal: ctrl.signal
    });
    return r;
  } catch (e) {
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
    // Try RAW first
    try {
      const rawUrl = wrapAllOrigins(url, 'raw');
      const r = await fetchWithTimeout(rawUrl);
      if (r.ok) return String(await r.text() ?? '');
    } catch {}

    // Fallback: JSON endpoint -> .contents
    try {
      const jsonUrl = wrapAllOrigins(url, 'json');
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
    // Try RAW first and parse as JSON (works if target sends JSON)
    try {
      const rawUrl = wrapAllOrigins(url, 'raw');
      const r = await fetchWithTimeout(rawUrl);
      if (r.ok) return await r.json();
    } catch {}

    // Fallback: AllOrigins JSON wrapper -> parse contents
    try {
      const jsonUrl = wrapAllOrigins(url, 'json');
      const r = await fetchWithTimeout(jsonUrl);
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
