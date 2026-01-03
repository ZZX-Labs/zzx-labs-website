// /static/js/modules/ticker-loader.js
(function () {
  const PATHS = [
    '.', '..', '../..', '../../..',
    '../../../..', '../../../../..', '../../../../../..', '../../../../../../..',
    '/' // site root
  ];

  function join(...segs) {
    return segs
      .filter(Boolean)
      .map((s, i) => {
        if (i === 0) return s === '/' ? '/' : s.replace(/\/+$/,'');
        return s.replace(/^\/+/, '');
      })
      .join('/');
  }

  async function probe(url) {
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      return r.ok;
    } catch (_) { return false; }
  }

  async function findTickerPrefix() {
    // Prefer prefix computed by other loaders if you have one
    if (window.ZZX && typeof window.ZZX.PREFIX === 'string') {
      const tryUrl = join(window.ZZX.PREFIX, 'bitcoin/ticker/ticker.html');
      if (await probe(tryUrl)) return window.ZZX.PREFIX;
    }
    // Otherwise search upwards
    for (const p of PATHS) {
      const url = join(p, 'bitcoin/ticker/ticker.html');
      if (await probe(url)) return p;
    }
    return '.'; // last resort
  }

  async function loadHTML(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Ticker HTML fetch failed: ${url} (${r.status})`);
    return await r.text();
  }

  function ensureScript(src) {
    if (document.querySelector('script[data-zzx-ticker-core="1"]')) return;

    const s = document.createElement('script');
    s.src = src;          // stable URL (NO Date.now bust)
    s.defer = true;
    s.setAttribute('data-zzx-ticker-core', '1');
    document.body.appendChild(s);
  }

  async function boot() {
    const container = document.getElementById('ticker-container');
    const mount = document.getElementById('btc-ticker');

    // if the page has neither, do nothing
    if (!container && !mount) return;

    // pick mount target: prefer #btc-ticker (your design)
    const target = mount || container;

    // Prevent duplicates across re-injected header/partials
    if (target.dataset.tickerLoaded === '1' || window.__ZZX_TICKER_LOADED) return;

    const prefix = await findTickerPrefix();

    try {
      // Inject fragment HTML
      const html = await loadHTML(join(prefix, 'bitcoin/ticker/ticker.html'));
      target.innerHTML = html;

      // Load ticker.js once, after HTML exists
      ensureScript(join(prefix, 'bitcoin/ticker/ticker.js'));

      target.dataset.tickerLoaded = '1';
      window.__ZZX_TICKER_LOADED = true;
    } catch (e) {
      console.warn('Ticker loader error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
