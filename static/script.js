// /static/script.js
(function () {
  function resolveBaseFromCurrentScript() {
    // Works even with relative includes like ../static/script.js
    const s = document.currentScript;
    if (!s) return '/static'; // best-effort fallback
    const url = new URL(s.src, location.href);
    url.pathname = url.pathname.replace(/\/[^/]*$/, ''); // strip filename
    return url.pathname; // e.g., '/static'
  }

  function load(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.defer = true;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }

  async function boot() {
    const base = resolveBaseFromCurrentScript();   // '/static'
    const sitewide = `${base}/js/script.js`;       // '/static/js/script.js'

    await load(sitewide);

    // Run auto init (idempotent)
    if (window.ZZXSite && typeof window.ZZXSite.autoInit === 'function') {
      window.ZZXSite.autoInit();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
