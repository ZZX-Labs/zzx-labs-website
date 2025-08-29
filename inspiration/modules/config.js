// Central config for Inspiration page
export const TTL_MS = 6 * 60 * 60 * 1000; // cache TTL for raw MW responses
export const MW_API = 'https://en.wikipedia.org/w/api.php';
export const ORIGIN = '&origin=*'; // CORS param
export const STATIC_CACHE_DIR = './cache'; // optional prefetch dir if you later add one

// Data sources
export const FIGURES_JSON = './figures/figures.json';
export const URLS_JSON    = './figures/urls.json';
export const PALETTE_JSON = './figures/color-palette.json';
export const IMAGES_DIR   = './figures/images'; // expects {id}.jpg (your pipeline fills)
