// /music/modules/cors.js — tiny CORS helpers using AllOrigins
// Usage:
//   import { fetchTextViaProxy, fetchJSONViaProxy, corsWrap } from './cors.js';
//   const txt = await fetchTextViaProxy(url, proxy); // proxy: "allorigins-raw" | "allorigins-json" | custom prefix
//   const j   = await fetchJSONViaProxy(url, proxy);

const AO_BASE = 'https://api.allorigins.win';

function wrapAllOrigins(url, mode) {
  const enc = encodeURIComponent(url);
  // disable AllOrigins cache for "live" now-playing endpoints
  if (mode === 'json') return `${AO_BASE}/get?url=${enc}&disableCache=true`;
  // mode === 'raw' (or default)
  return `${AO_BASE}/raw?url=${enc}&disableCache=true`;
}

/**
 * Generic wrapper that understands:
 *  - "allorigins", "allorigins-raw"  -> raw passthrough
 *  - "allorigins-json"               -> JSON wrapper { contents, status }
 *  - Any other string                -> treated as prefix (old behavior)
 *  - falsy                           -> no proxy
 */
export function corsWrap(proxy, url) {
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

/* ------------------- Fetchers (use these) ------------------- */

export async function fetchTextViaProxy(url, proxy) {
  // Try RAW first when using AllOrigins (best for plaintext/CSV)
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // raw -> text
    try {
      const r = await fetch(corsWrap('allorigins-raw', url), {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (r.ok) return await r.text();
    } catch {}

    // fallback: JSON endpoint -> .contents (and respect status.http_code if present)
    try {
      const r = await fetch(corsWrap('allorigins-json', url), {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (!r.ok) return '';
      const j = await r.json();
      const code = j?.status?.http_code;
      if (code && code >= 400) return '';
      return String(j?.contents || '');
    } catch {}
    return '';
  }

  // Non-AllOrigins path/prefix
  try {
    const r = await fetch(corsWrap(proxy, url), {
      cache: 'no-store',
      headers: {
        'pragma': 'no-cache',
        'cache-control': 'no-cache'
      }
    });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

export async function fetchJSONViaProxy(url, proxy) {
  const p = String(proxy || '').toLowerCase();
  if (p.startsWith('allorigins')) {
    // Try RAW first and parse as JSON (works if target sends application/json, CORS is handled by AO)
    try {
      const r = await fetch(corsWrap('allorigins-raw', url), {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (r.ok) return await r.json();
    } catch {}

    // Fallback: AllOrigins JSON wrapper -> parse contents and respect status.http_code
    try {
      const r = await fetch(corsWrap('allorigins-json', url), {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (!r.ok) return null;
      const j = await r.json();
      const code = j?.status?.http_code;
      if (code && code >= 400) return null;
      const txt = j?.contents || '';
      if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    } catch {}
    return null;
  }

  // Non-AllOrigins path/prefix
  try {
    const r = await fetch(corsWrap(proxy, url), {
      cache: 'no-store',
      headers: {
        'pragma': 'no-cache',
        'cache-control': 'no-cache'
      }
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
