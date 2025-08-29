// Centralized config (keep this tiny)
export const TTL_MS = 6 * 60 * 60 * 1000; // 6h for raw MW responses
export const MW_API = 'https://en.wikipedia.org/w/api.php';
export const ORIGIN = '&origin=*'; // CORS parm for client-side calls
export const HEADERS_TO_INCLUDE = null; // e.g. ['0','1','2'] to limit levels
export const STATIC_CACHE_DIR = './cache'; // optional static files dir
