// /music/modules/cors.js — Tiny CORS helpers (AllOrigins enforced)
// Provides: fetchTextViaProxy, fetchJSONViaProxy, corsWrap
// Default proxy: AllOrigins RAW + JSON fallback.

const AO_BASE = 'https://api.allorigins.win';
const DEFAULT_TIMEOUT_MS = 9000;

function wrapAllOrigins(url, mode) {
  const enc = encodeURIComponent(url);
  if (mode === 'json') return `${AO_BASE}/get?url=${enc}&disableCache=true`;
  return `${AO_BASE}/raw?url=${enc}&disableCache=true`;
}

/**
 * corsWrap(proxy, url, prefer='raw')
 * - proxy can be 'allorigins-raw', 'allorigins-json', or custom prefix.
 * - returns a fully wrapped URL suitable for fetch().
 */
export function corsWrap(proxy, url, prefer = 'raw') {
  if (!url) return '';
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) return wrapAllOrigins(url, prefer);
  if (p.includes('?')) return proxy + encodeURIComponent(url);
  return proxy.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

/* -------------------------------- Fetch helpers -------------------------------- */

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

/**
 * Fetch text through AllOrigins (raw first, JSON fallback)
 */
export async function fetchTextViaProxy(url, proxy = 'allorigins-raw') {
  try {
    const r1 = await fetchWithTimeout(corsWrap(proxy, url, 'raw'));
    if (r1.ok) return await r1.text();

    const r2 = await fetchWithTimeout(corsWrap('allorigins-json', url));
    if (!r2.ok) return '';
    const j = await r2.json();
    return String(j?.contents || '');
  } catch {
    return '';
  }
}

/**
 * Fetch JSON through AllOrigins (RAW parse first, JSON wrapper fallback)
 */
export async function fetchJSONViaProxy(url, proxy = 'allorigins-raw') {
  try {
    const r1 = await fetchWithTimeout(corsWrap(proxy, url, 'raw'));
    if (r1.ok) return await r1.json();
  } catch {}

  try {
    const r2 = await fetchWithTimeout(corsWrap('allorigins-json', url));
    if (!r2.ok) return null;
    const j = await r2.json();
    const txt = j?.contents || '';
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}
