// /music/modules/utils.js — DROP-IN upgrade (robust paths + smarter normalizeNow)

export const isGH = (typeof location !== 'undefined') && location.hostname.endsWith('github.io');

/**
 * Resolve repo prefix when hosted on GitHub Pages project sites.
 * Examples:
 *  - Local / custom host: "/"          -> "/"
 *  - GH Pages /user/repo/...           -> "/repo/"
 */
export function repoPrefix() {
  if (!isGH || typeof location === 'undefined') return '/';
  const parts = location.pathname.split('/').filter(Boolean);
  // '/user.github.io/repo/…' => first segment is the repo
  return parts.length ? `/${parts[0]}/` : '/';
}

export const $  = (s, c=document) => c.querySelector(s);
export const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));

export const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.25));

/** Absolute URL or root-absolute path? */
export const isAbs = u => /^([a-z][a-z0-9+\-.]*:)?\/\//i.test(u) || String(u).startsWith('/');

/**
 * Join a base path (can be path-like, not necessarily full URL) and a relative path.
 * - Keeps absolute `rel` untouched
 * - Normalizes duplicate slashes and leading "./"
 * - Preserves query/hash on `rel` if present
 */
export function join(base, rel){
  if (!rel) return String(base || '');
  if (isAbs(rel)) return rel;

  // Normalize "./" on rel first
  rel = String(rel).replace(/^\.\//, '');

  // If base already has protocol, use URL() directly
  try {
    const hasProto = /^[a-z][a-z0-9+\-.]*:\/\//i.test(base);
    const absBase = hasProto
      ? base
      : (typeof location !== 'undefined'
         ? (location.origin + (String(base||'').startsWith('/') ? '' : '/') + String(base||''))
         : ('/' + String(base||'')));

    const u = new URL(absBase);
    // Rebuild pathname with a single slash between
    const path = (u.pathname.replace(/\/+$/,'') + '/' + String(rel).replace(/^\/+/, ''))
      .replace(/\/\.(?=\/)/g, '/')     // "/./" -> "/"
      .replace(/\/{2,}/g, '/');        // collapse multiple slashes
    u.pathname = path;
    // Only return path + search + hash (no origin)
    return u.pathname + u.search + u.hash;
  } catch {
    // Fallback (path-only join)
    return (String(base||'').replace(/\/+$/,'') + '/' + String(rel).replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
  }
}

/** mm:ss (or em-dash when unknown) */
export const fmtTime = sec => (!isFinite(sec)||sec<0)
  ? '—'
  : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

/**
 * Normalize "now playing" strings to "Artist - Title".
 * Heuristics:
 * - Collapse whitespace
 * - Split on " - " (first dash as boundary; keep the rest as title)
 * - Trim common stream junk suffixes (bitrate, " | Station", extra branding)
 * - Keep useful suffixes like "(Remix|Edit|Extended|Mix)" intact
 */
export function normalizeNow(s){
  if (!s) return '';
  let txt = String(s)
    .replace(/\s+/g,' ')
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, '')  // trim quotes
    .trim();

  // Strip common trailing junk: " | Station", " • Something", " — Something"
  txt = txt.replace(/\s*(\||•|—|-)\s*(radio|fm|am|live|station|stream|online|hq|ultra hd|4k)$/i, '').trim();

  // Strip obvious bitrate / codec decorations at the end
  txt = txt.replace(/\s*\b(32|64|96|128|160|192|256|320)\s?(kbps|kbit|kb|aac|mp3|opus|ogg)\b\s*$/i, '').trim();

  // Prefer "Artist - Title (rest)" keeping the rest in title
  const parts = txt.split(' - ');
  if (parts.length >= 2) {
    const artist = parts.shift().trim();
    const title  = parts.join(' - ').trim();
    return `${artist} - ${title}`;
  }

  return txt;
}
