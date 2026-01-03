// ZZX Partials Loader — works from any depth, no server rewrites needed.
// DROP-IN REPLACEMENT: partials-loader.js
// NOTE: ticker injection REMOVED. Ticker is handled ONLY by ticker-loader.js now.

(function () {
  const PARTIALS_DIR = '__partials';
  const PATHS = [
    '.', '..', '../..', '../../..',
    '../../../..', '../../../../..', '../../../../../..', '../../../../../../..',
    '/' // final attempt: site root (only works if hosted at domain root)
  ];

  // Try a URL to see if it's OK (GET, no-store) — returns true/false
  async function probe(url) {
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  // Preserve absolute root if first seg is exactly '/'
  function join(...segs) {
    return segs
      .filter(Boolean)
      .map((s, i) => {
        if (i === 0) return s === '/' ? '/' : String(s).replace(/\/+$/, '');
        return String(s).replace(/^\/+/, '');
      })
      .join('/');
  }

  // Validate a cached prefix; if invalid, clear & recompute
  async function validateOrRecomputePrefix(cached) {
    if (cached) {
      const ok = await probe(join(cached, PARTIALS_DIR, 'header/header.html'));
      if (ok) return cached;
      sessionStorage.removeItem('zzx.partials.prefix');
    }
    // recompute:
    for (const p of PATHS) {
      const url = join(p, PARTIALS_DIR, 'header/header.html');
      if (await probe(url)) {
        sessionStorage.setItem('zzx.partials.prefix', p);
        return p;
      }
    }
    return '.';
  }

  async function findPrefix() {
    const cached = sessionStorage.getItem('zzx.partials.prefix');
    return await validateOrRecomputePrefix(cached);
  }

  // Convert absolute '/x/y' → '<prefix>/x/y' safely (no double slashes)
  function absToPrefix(url, prefix) {
    if (prefix === '/' || !url || !url.startsWith('/')) return url;
    return prefix.replace(/\/+$/, '') + url;
  }

  // Rewrites <a href="/..."> and <img src="/..."> etc. to prefix-based
  function rewriteAbsoluteURLs(root, prefix) {
    if (!root || prefix === '/') return;

    // Rewrite href/src that are site-absolute
    root.querySelectorAll('[href^="/"]').forEach(a => {
      const v = a.getAttribute('href');
      if (v) a.setAttribute('href', absToPrefix(v, prefix));
    });
    root.querySelectorAll('[src^="/"]').forEach(el => {
      const v = el.getAttribute('src');
      if (v) el.setAttribute('src', absToPrefix(v, prefix));
    });
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
  function initNavUX(scope = document) {
    const toggle = scope.querySelector('#navbar-toggle');
    const links  = scope.querySelector('#navbar-links');
    const body   = document.body;

    if (toggle && links) {
      if (!toggle.__bound_click) {
        toggle.__bound_click = true;
        toggle.addEventListener('click', () => {
          const isOpen = links.classList.toggle('open');
          toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          links.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
          body.classList.toggle('no-scroll', isOpen);
        });
      }
    }

    scope.querySelectorAll('.submenu-toggle').forEach(btn => {
      if (btn.__bound_click) return;
      btn.__bound_click = true;
      btn.addEventListener('click', () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains('submenu')) {
          ul.classList.toggle('open');
          btn.classList.toggle('open');
        }
      });
    });
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
      try { window.ZZXSite.initNav(headerHost); } catch (_) {}
      try { if (typeof window.ZZXSite.autoInit === 'function') window.ZZXSite.autoInit(); } catch (_) {}
    } else {
      initNavUX(headerHost);
    }

    // IMPORTANT:
    // No ticker loading here. Ticker is handled by /static/js/modules/ticker-loader.js only.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
