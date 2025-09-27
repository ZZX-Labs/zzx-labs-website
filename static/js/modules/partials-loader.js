// ZZX Partials Loader — works from any depth, no server rewrites needed.
(function () {
  const PARTIALS_DIR = '__partials';
  const PATHS = [
    '.', '..', '../..', '../../..',
    '../../../..', '../../../../..', '../../../../../..', '../../../../../../..',
    '/' // final attempt: site root
  ];

  // Simple fetch probe to discover a working prefix for __partials/
  async function findPrefix() {
    const cached = sessionStorage.getItem('zzx.partials.prefix');
    if (cached) return cached;

    for (const p of PATHS) {
      const url = join(p, PARTIALS_DIR, 'header/header.html');
      try {
        // HEAD is light, but some static hosts may block it; fall back to GET if needed
        let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) {
          r = await fetch(url, { method: 'GET', cache: 'no-store' });
        }
        if (r.ok) {
          sessionStorage.setItem('zzx.partials.prefix', p);
          return p;
        }
      } catch (_) {}
    }
    // Fallback to current directory
    return '.';
  }

  function join(...segs) {
    // Preserve absolute root if first seg is exactly '/'
    return segs
      .filter(Boolean)
      .map((s, i) => {
        if (i === 0) return s === '/' ? '/' : s.replace(/\/+$/,'');
        return s.replace(/^\/+/, '');
      })
      .join('/');
  }

  function absToPrefix(url, prefix) {
    // If prefix is '/', keep absolute site-root URLs untouched to avoid protocol-relative ('//...')
    if (prefix === '/') return url;
    return url.replace(/^(\/+)/, `${prefix}/`);
  }

  // Rewrites <a href="/..."> and <img src="/..."> etc. to prefix-based
  function rewriteAbsoluteURLs(root, prefix) {
    // Skip rewriting entirely if prefix === '/'
    if (prefix !== '/') {
      root.querySelectorAll('[href^="/"]').forEach(a => a.setAttribute('href', absToPrefix(a.getAttribute('href'), prefix)));
      root.querySelectorAll('[src^="/"]').forEach(el => el.setAttribute('src', absToPrefix(el.getAttribute('src'), prefix)));
    }
  }

  async function loadHTML(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return await r.text();
  }

  // Insert NAV into HEADER at <!-- navbar Here --> or append
  function injectNavIntoHeader(headerHTML, navHTML) {
    const marker = '<!-- navbar Here -->';
    if (headerHTML.includes(marker)) {
      return headerHTML.replace(marker, navHTML);
    }
    const idx = headerHTML.lastIndexOf('</div>');
    if (idx !== -1) {
      return headerHTML.slice(0, idx) + '\n' + navHTML + '\n' + headerHTML.slice(idx);
    }
    return headerHTML + '\n' + navHTML;
  }

  // Minimal nav interactivity after injection (fallback only), mirrors sitewide behavior
  function initNavUX(scope=document) {
    const toggle = scope.querySelector('#navbar-toggle');
    const links  = scope.querySelector('#navbar-links');
    const body   = document.body;

    if (toggle && links) {
      // mark so the sitewide init can detect & avoid double-binding
      toggle.__bound_click = true;
      toggle.addEventListener('click', () => {
        const isOpen = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        links.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        body.classList.toggle('no-scroll', isOpen);
      });
    }
    scope.querySelectorAll('.submenu-toggle').forEach(btn => {
      btn.__bound_click = true;
      btn.addEventListener('click', (e) => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains('submenu')) {
          ul.classList.toggle('open');
          btn.classList.toggle('open');
        }
      });
    });
  }

  // Optional ticker
  async function maybeLoadTicker(prefix) {
    const tc = document.getElementById('ticker-container');
    if (!tc) return;
    try {
      const html = await loadHTML(join(prefix, 'bitcoin/ticker/ticker.html'));
      tc.innerHTML = html;
      const s = document.createElement('script');
      s.src = join(prefix, 'bitcoin/ticker/ticker.js');
      document.body.appendChild(s);
    } catch (e) {
      console.warn('Ticker load failed:', e);
    }
  }

  // Wait briefly for sitewide initializer to appear (avoids double-binding race)
  function waitForSitewideInit(timeoutMs = 1200, intervalMs = 60) {
    return new Promise(resolve => {
      const t0 = performance.now();
      (function poll() {
        if (window.ZZXSite && typeof window.ZZXSite.initNav === 'function') return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        setTimeout(poll, intervalMs);
      })();
    });
  }

  async function boot() {
    const prefix = await findPrefix();
    window.ZZX = Object.assign({}, window.ZZX || {}, { PREFIX: prefix });

    // Ensure header/footer host nodes exist
    let headerHost = document.getElementById('zzx-header');
    if (!headerHost) {
      headerHost = document.createElement('div');
      headerHost.id = 'zzx-header';
      document.body.prepend(headerHost);
    }
    let footerHost = document.getElementById('zzx-footer');
    if (!footerHost) {
      footerHost = document.createElement('div');
      footerHost.id = 'zzx-footer';
      document.body.appendChild(footerHost);
    }

    // Load partials
    const [headerHTML, navHTML, footerHTML] = await Promise.all([
      loadHTML(join(prefix, PARTIALS_DIR, 'header/header.html')),
      loadHTML(join(prefix, PARTIALS_DIR, 'nav/nav.html')),
      loadHTML(join(prefix, PARTIALS_DIR, 'footer/footer.html'))
    ]);

    // Compose header + nav
    const composedHeader = injectNavIntoHeader(headerHTML, navHTML);

    // Inject into DOM
    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = composedHeader;
    rewriteAbsoluteURLs(headerWrap, prefix);
    headerHost.replaceChildren(...headerWrap.childNodes);

    const footerWrap = document.createElement('div');
    footerWrap.innerHTML = footerHTML;
    rewriteAbsoluteURLs(footerWrap, prefix);
    footerHost.replaceChildren(...footerWrap.childNodes);

    // Prefer sitewide initializer; if not present soon, attach fallback
    const hasSitewide = await waitForSitewideInit();
    if (hasSitewide) {
      window.ZZXSite.initNav(headerHost);
      // let your sitewide autoInit (if any) run as well
      if (typeof window.ZZXSite.autoInit === 'function') window.ZZXSite.autoInit();
    } else {
      initNavUX(headerHost);
    }

    // Optional ticker
    await maybeLoadTicker(prefix);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
