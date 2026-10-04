// /inspiration/figures/modules/net.js

// Robust JSON fetch with helpful errors and a timeout.
// Usage stays the same: j(url)
// Optional: j(url, { timeoutMs: 12000, cache: 'no-cache', cacheBust: true })
export async function j(input, opts = {}) {
  const {
    timeoutMs = 12000,
    cache = 'no-cache',
    cacheBust = false,
  } = opts;

  const urlStr   = String(input);
  const finalUrl = cacheBust ? appendCacheBust(urlStr) : urlStr;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(finalUrl, { cache, signal: ctrl.signal });

    if (!r.ok) throw httpError(finalUrl, r);

    // Parse text first (handles BOM & gives better error previews)
    const ct   = r.headers.get('content-type') || '';
    const text = await r.text();

    try {
      return JSON.parse(stripBom(text));
    } catch (err) {
      const snippet = text.slice(0, 200);
      const hint = ct.toLowerCase().includes('json') ? '' : ' (content-type is not JSON)';
      throw new Error(`JSON parse failed for ${finalUrl}${hint}: ${err.message}\nPreview: ${snippet}`);
    }
  } finally {
    clearTimeout(t);
  }
}

// URL join that always returns a string (href). Accepts base URL or path.
export function urlJoin(dir, name) {
  try {
    const base = String(dir);
    const url  = new URL(name, base.endsWith('/') ? base : base + '/');
    return url.href;
  } catch {
    // If something odd was passed, fall through with the name
    return String(name);
  }
}

/* ---------- internals ---------- */
function stripBom(s) {
  return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function httpError(url, r) {
  return new Error(`${url} → ${r.status} ${r.statusText}`);
}

function appendCacheBust(u) {
  try {
    const url = new URL(u, location.href);
    url.searchParams.set('v', Date.now().toString(36));
    return url.href;
  } catch {
    return u;
  }
}
