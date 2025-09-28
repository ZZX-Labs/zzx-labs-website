// Centralized config (v2) — same knobs you had before

// --- existing named exports (unchanged) ---
export const TTL_MS = 6 * 60 * 60 * 1000;          // 6h for raw MW responses (localStorage)
export const MW_API = 'https://en.wikipedia.org/w/api.php';
export const ORIGIN = '&origin=*';                 // CORS param for client-side calls
export const HEADERS_TO_INCLUDE = null;            // e.g. ['0','1','2'] to limit sections
export const STATIC_CACHE_DIR = './cache';         // optional static files dir

// --- new toggles / tuning knobs ---
export const STATIC_CACHE_ENABLED = true;          // prefer using ./cache when fresh (lastrevid match)
export const PREFETCH_STRATEGY = 'prefer-static';  // 'prefer-static' | 'prefer-live' (when both exist & fresh)

export const IDB_MAX_ENTRIES = 400;                // soft cap; call idbPrune(IDB_MAX_ENTRIES) after boot()
export const DEBUG_LOG = false;                    // flip to true for verbose console logs

// Collapse behavior for reference-like sections
export const COLLAPSE_BY_HEADING = true;           // collapse if heading matches “References/Citations/…”
export const COLLAPSE_BY_HEURISTIC = true;         // collapse if section HTML looks like references
export const REF_HEURISTIC_SUP_THRESHOLD = 4;      // superscript/cite signals needed to auto-collapse

// Networking
export const REQUEST_TIMEOUT_MS = 15000;           // fetch timeout (ms) for MW calls
export const RETRY = 2;                            // retries on transient network errors
export const RETRY_BACKOFF_MS = 400;               // base backoff between retries

// TOC / UX
export const TOC_INCLUDE_LEAD = false;             // skip MW “lead” (toclevel 0) in the sidebar TOC

// CSP hints (useful for your server config; not consumed unless you wire it)
export const WIKI_ALLOWED_ORIGINS = [
  'https://en.wikipedia.org',
  'https://*.wikipedia.org'
];

// Default fetch init for dynamic requests (safe no-cache)
export const FETCH_INIT = Object.freeze({ cache: 'no-cache' });

// --- optional convenience: a single object export if you prefer importing en masse ---
export const CONFIG = Object.freeze({
  TTL_MS,
  MW_API,
  ORIGIN,
  HEADERS_TO_INCLUDE,
  STATIC_CACHE_DIR,
  STATIC_CACHE_ENABLED,
  PREFETCH_STRATEGY,
  IDB_MAX_ENTRIES,
  DEBUG_LOG,
  COLLAPSE_BY_HEADING,
  COLLAPSE_BY_HEURISTIC,
  REF_HEURISTIC_SUP_THRESHOLD,
  REQUEST_TIMEOUT_MS,
  RETRY,
  RETRY_BACKOFF_MS,
  TOC_INCLUDE_LEAD,
  WIKI_ALLOWED_ORIGINS,
  FETCH_INIT
});
