// /inspiration/figures/modules/paths.js
export const BASE      = new URL('../', import.meta.url);
export const PALETTE   = new URL('color-palette.json', BASE);
export const FIGURES   = new URL('figures.json', BASE);
export const URLS_URL  = new URL('urls.json', BASE);
export const CARDS_DIR = new URL('cards/', BASE);
export const IMGS_DIR  = new URL('images/', BASE);

// Wikipedia
export const MW_API = 'https://en.wikipedia.org/w/api.php';
export const ORIGIN = '&origin=*';
