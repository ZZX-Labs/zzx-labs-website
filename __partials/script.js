<script>
(() => {
  const mount = document.getElementById('ticker-container');
  if (!mount) return;

  // IMPORTANT: root-relative paths so page depth never breaks it
  const HTML_URL = '/__partials/bitcoin-ticker-widget.html';
  const CSS_URL  = '/__partials/bitcoin-ticker-widget.css';

  // Minimal widget runtime + sub-widgets (load once)
  const JS = [
    '/__partials/widgets/runtime.js',

    // core subwidgets (add as you modularize)
    '/__partials/widgets/mempool-goggles/widget.js',
    // '/__partials/widgets/nodes/widget.js',
    // '/__partials/widgets/lightning/widget.js',
    // '/__partials/widgets/satoshi-quote/widget.js',
    // '/__partials/widgets/news/widget.js',
  ];

  function loadCSS(href) {
    if (document.querySelector(`link[data-zzx-css="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.zzxCss = href;
    document.head.appendChild(link);
  }

  function loadJS(src) {
    return new Promise((resolve) => {
      if (document.querySelector(`script[data-zzx-js="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.zzxJs = src;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // non-fatal
      document.head.appendChild(s);
    });
  }

  async function boot() {
    try {
      loadCSS(CSS_URL);

      const res = await fetch(HTML_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${HTML_URL} HTTP ${res.status}`);
      const html = await res.text();
      mount.innerHTML = html;

      // runtime first, then subwidgets
      for (const src of JS) await loadJS(src);

      // start registry (safe if already started)
      window.__ZZX_WIDGETS?.start?.();
    } catch (e) {
      console.error('Error loading bitcoin widget:', e);
    }
  }

  boot();
})();
</script>
