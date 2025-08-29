// /inspiration/figures/modules/paths.js

// --- optional overrides (use either) ---
// 1) <meta name="fig-base" content="/inspiration/figures/">
// 2) window.__FIG_BASE__ = '/inspiration/figures/'
const META_BASE = typeof document !== 'undefined'
  ? document.querySelector('meta[name="fig-base"]')?.content
  : null;

const RUNTIME_BASE = (typeof window !== 'undefined' && window.__FIG_BASE__)
  ? String(window.__FIG_BASE__)
  : null;

// Resolve a base URL robustly
function resolveBase() {
  // Prefer explicit overrides
  if (RUNTIME_BASE) return new URL(ensureSlash(RUNTIME_BASE), location.href);
  if (META_BASE)    return new URL(ensureSlash(META_BASE), location.href);

  // Default: one level up from this module (…/inspiration/figures/)
  return new URL('../', import.meta.url);
}

// Ensure directory-style URL (trailing slash)
function ensureSlash(u) {
  const s = String(u);
  return s.endsWith('/') ? s : s + '/';
}

// Exported BASE
export const BASE = resolveBase();

// Project assets relative to BASE
export const PALETTE   = new URL('color-palette.json', BASE);
export const FIGURES   = new URL('figures.json', BASE);
export const URLS_URL  = new URL('urls.json', BASE);
export const CARDS_DIR = new URL(ensureSlash('cards/'), BASE);
export const IMGS_DIR  = new URL(ensureSlash('images/'), BASE);

// Wikipedia API base
export const MW_API = 'https://en.wikipedia.org/w/api.php';
// Kept for backward compatibility where you concatenate strings
export const ORIGIN = '&origin=*';

// Helper: build a full Wikipedia API URL with sane defaults & CORS
export function wikiApi(params = {}) {
  const u = new URL(MW_API);
  const defaults = {
    origin: '*',
    format: 'json',
    formatversion: 2
  };
  const all = { ...defaults, ...params };
  Object.entries(all).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}
