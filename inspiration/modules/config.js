// /inspiration/modules/config.js
// Central config for Inspiration page (module-relative, robust paths)

export const BRAND_HEX = '#c0d674';
export const TTL_MS = 6 * 60 * 60 * 1000; // cache TTL for raw MW responses

// MediaWiki API
export const MW_API = 'https://en.wikipedia.org/w/api.php';
export const ORIGIN = '&origin=*'; // CORS param

// Resolve everything relative to this module’s location: /inspiration/modules/
const BASE = new URL('../', import.meta.url);

// Optional prefetch dir (if you later add static JSON dumps)
export const STATIC_CACHE_DIR = new URL('cache', BASE).toString();

// Data sources (live)
export const FIGURES_JSON = new URL('figures/figures.json', BASE).toString();
export const URLS_JSON    = new URL('figures/urls.json', BASE).toString();
export const PALETTE_JSON = new URL('figures/color-palette.json', BASE).toString();

// Images: keep as directory string (no trailing slash)
export const IMAGES_DIR   = new URL('figures/images', BASE).toString();

// Helper to build an absolute image URL for an id (default .jpg)
export const IMG = (id, ext = 'jpg') =>
  new URL(`figures/images/${id}.${ext}`, BASE).toString();
