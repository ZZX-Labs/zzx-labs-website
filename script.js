// /script.js (homepage bootstrapper)
//
// 1) Load /static/script.js (partials + nav + ticker)
// 2) Load credits module (idempotent)
// 3) Apply home-specific tweak (add scroll-animation to .hero)
//
// Notes:
// - Idempotent (won't double-load if scripts already present)
// - Retries autoInit briefly to avoid race conditions

(function () {
  const ABS = (u) => new URL(u, location.href).href;

  function alreadyLoaded(srcAbs) {
    return Array.from(document.scripts).some(s => s.src === srcAbs);
  }

  function load(src, { module = false, attrs = {} } = {}) {
    const href = ABS(src);
    if (alreadyLoaded(href)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = href;
      el.defer = true;
      if (module) el.type = 'module';
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.onload = resolve;
      el.onerror = () => reject(new Error('Failed to load ' + href));
      document.head.appendChild(el);
    });
  }

  // Try calling ZZXSite.autoInit a few times in case modules load slightly later
  async function tryAutoInit(retries = 3, delayMs = 120) {
    for (let i = 0; i < retries; i++) {
      if (window.ZZXSite && typeof window.ZZXSite.autoInit === 'function') {
        try { window.ZZXSite.autoInit(); } catch {}
        return;
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
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
