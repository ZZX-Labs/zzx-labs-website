// /static/js/modules/ticker-loader.js
(function () {
  const PATHS = [
    '.', '..', '../..', '../../..',
    '../../../..', '../../../../..', '../../../../../..', '../../../../../../..',
    '/' // final attempt: site root (works only when hosted at domain root)
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
    // Prefer the already-computed prefix from partials-loader
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

  async function boot() {
    const container = document.getElementById('ticker-container');
    if (!container) return;

    // Prevent duplicate loads (cross-page nav / partials re-injection)
    if (container.dataset.tickerLoaded === '1' || window.__ZZX_TICKER_LOADED) return;

    const prefix = await findTickerPrefix();
    try {
      const html = await loadHTML(join(prefix, 'bitcoin/ticker/ticker.html'));
      container.innerHTML = html;

      // Append ticker.js with cache-bust to ensure live updates keep working
      if (!document.querySelector('script[data-zzx-ticker]')) {
        const s = document.createElement('script');
        s.src = join(prefix, 'bitcoin/ticker/ticker.js') + `?v=${Date.now()}`;
        s.defer = true;
        s.setAttribute('data-zzx-ticker', '1');
        document.body.appendChild(s);
      }

      container.dataset.tickerLoaded = '1';
      window.__ZZX_TICKER_LOADED = true;
    } catch (e) {
      console.warn('Ticker loader error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
