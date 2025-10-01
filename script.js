// Local homepage bootstrapper.
// 1) Loads global /static/script.js (which injects header/nav/footer and ticker)
// 2) Ensures credits loader is included
// 3) Runs any home-specific tweaks safely

(function () {
  function load(src, { module = false, attrs = {} } = {}) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      if (module) s.type = 'module';
      Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    // 1) Global site behavior: nav/partials + ticker
    await load('/static/script.js');

    // Re-run init just in case (idempotent)
    if (window.ZZXSite && typeof window.ZZXSite.autoInit === 'function') {
      window.ZZXSite.autoInit();
    }

    // 2) Credits partial (explicit for homepage)
    //    (Module keeps its own idempotency; it becomes a no-op if already on page)
    await load('/__partials/credits/loader.js', { module: true });

    // 3) Home-specific niceties (optional)
    try {
      const hero = document.querySelector('.hero');
      if (hero) {
        hero.classList.add('scroll-animation'); // will be picked up by global scroll FX
      }
    } catch (e) {
      console.warn('Home enhancements skipped:', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
