// /script.js (homepage bootstrapper)
//
// 1) Load /static/script.js (partials + nav + ticker)
// 2) Load credits module (idempotent)
// 3) Apply home-specific tweak (add scroll-animation to .hero)
//
// Hardening:
// - CSP nonce support via <meta name="csp-nonce" content="...">
// - Asset versioning via <meta name="asset-version" content="..."> (adds ?v=...)
// - Idempotent loader with normalized duplicate detection
// - Safe module handling (no defer on type="module")
// - Gentle retry/backoff for ZZXSite.autoInit()

(function () {
  const ABS = (u) => new URL(u, location.href).href;

  // read <meta> helpers (optional)
  const META = (name) => {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };
  const NONCE = META('csp-nonce');
  const VER = META('asset-version');

  const LOG = false; // flip true for debug
  const log = (...args) => { if (LOG) console.log('[home-boot]', ...args); };

  // Optional: treat URLs as duplicates even if only their query differs
  const SAME_URL_IGNORING_QUERY = true;

  function sameScript(a, b) {
    try {
      const A = new URL(a); const B = new URL(b);
      if (SAME_URL_IGNORING_QUERY) {
        return A.origin === B.origin && A.pathname === B.pathname;
      }
      return A.href === B.href;
    } catch { return a === b; }
  }

  function alreadyLoaded(srcAbs) {
    return Array.from(document.scripts)
      .some(s => s.src && sameScript(s.src, srcAbs));
  }

  function withBust(src) {
    if (!VER) return src;
    const u = new URL(src, location.href);
    if (!u.searchParams.has('v')) u.searchParams.set('v', VER);
    return u.href;
  }

  function load(src, { module = false, attrs = {} } = {}) {
    const href = withBust(ABS(src));
    if (alreadyLoaded(href)) { log('skip (dup):', href); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = href;
      if (module) el.type = 'module'; else el.defer = true;
      if (NONCE) el.setAttribute('nonce', NONCE);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.onload = () => { log('loaded:', href); resolve(); };
      el.onerror = () => reject(new Error('Failed to load ' + href));
      document.head.appendChild(el);
    });
  }

  // Try calling ZZXSite.autoInit a few times in case modules load slightly later
  async function tryAutoInit(retries = 4, delayMs = 120) {
    for (let i = 0; i < retries; i++) {
      if (window.ZZXSite && typeof window.ZZXSite.autoInit === 'function') {
        try { window.ZZXSite.autoInit(); } catch {}
        return;
      }
      await new Promise(r => setTimeout(r, delayMs));
      delayMs = Math.min(500, Math.round(delayMs * 1.5));
    }
    log('autoInit not found (ok if static only)');
  }

  async function boot() {
    // 1) Sitewide (nav/partials + ticker)
    await load('/static/script.js');

    // Ensure init (idempotent)
    await tryAutoInit();

    // 2) Credits (module; safe no-op if already loaded)
    await load('/__partials/credits/loader.js', { module: true });

    // 3) Home-only nicety
    const hero = document.querySelector('.hero');
    if (hero) hero.classList.add('scroll-animation'); // picked up by global scroll FX
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot().catch(console.warn); }, { once: true });
  } else {
    boot().catch(console.warn);
  }
})();
