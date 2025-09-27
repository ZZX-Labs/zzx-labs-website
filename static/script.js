// /static/script.js
(function () {
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function boot() {
    // Load the sitewide main
    await load('./js/script.js');

    // Run auto init (safe if called multiple times)
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
