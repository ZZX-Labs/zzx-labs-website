// /static/js/script.js
(function () {
  const Z = (window.ZZXSite = window.ZZXSite || {});
  let booted = false;

  // Resolve this script's own base path (e.g., '/static/js')
  function resolveThisBase() {
    // document.currentScript is reliable here (non-module, executing in-order)
    const s = document.currentScript;
    if (!s) return '/static/js';
    const url = new URL(s.src, location.href);
    url.pathname = url.pathname.replace(/\/[^/]*$/, ''); // strip filename
    return url.pathname;
  }

  function load(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.defer = true;
      el.onload = () => resolve(src);
      el.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  // Helper: attach once per element
  function onOnce(el, type, handler, opts) {
    const key = `__bound_${type}`;
    if (el[key]) return;
    el.addEventListener(type, handler, opts);
    el[key] = true;
  }

  // Initialize NAV UX inside a given scope (defaults to document)
  function initNav(scope = document) {
    const toggle = scope.querySelector('#navbar-toggle') || document.getElementById('navbar-toggle');
    const links  = scope.querySelector('#navbar-links')  || document.getElementById('navbar-links');
    const body   = document.body;

    if (toggle && links) {
      onOnce(toggle, 'click', () => {
        const isOpen = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        links.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        body.classList.toggle('no-scroll', isOpen);
      });
    }

    (scope.querySelectorAll('.submenu-toggle') || []).forEach(btn => {
      onOnce(btn, 'click', () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains('submenu')) {
          ul.classList.toggle('open');
          btn.classList.toggle('open');
        }
      });
    });

    (scope.querySelectorAll('a[href^="#"]') || []).forEach(link => {
      onOnce(link, 'click', (e) => {
        e.preventDefault();
        const id = link.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        window.scrollTo({ top: target.offsetTop - 60, behavior: 'smooth' });

        if (links && links.classList.contains('open')) {
          links.classList.remove('open');
          toggle && toggle.setAttribute('aria-expanded', 'false');
          links.setAttribute('aria-hidden', 'true');
          body.classList.remove('no-scroll');
        }
      });
    });

    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(a => {
      onOnce(a, 'click', () => {
        navLinksList.forEach(n => n.classList.remove('active'));
        a.classList.add('active');
      });
    });
  }

  function initButtons() {
    document.querySelectorAll('button').forEach(btn => {
      onOnce(btn, 'mouseover', () => (btn.style.transform = 'scale(1.05)'));
      onOnce(btn, 'mouseout',  () => (btn.style.transform = 'scale(1)'));
      onOnce(btn, 'mousedown', () => (btn.style.transform = 'scale(1)'));
    });
  }

  function initScrollAnimations() {
    const scrollElements = document.querySelectorAll('.scroll-animation');
    function isInViewport(el) {
      const r = el.getBoundingClientRect();
      return r.top <= (window.innerHeight || document.documentElement.clientHeight) && r.bottom >= 0;
    }
    function tick() {
      scrollElements.forEach(el => {
        if (isInViewport(el)) el.classList.add('in-view');
        else el.classList.remove('in-view');
      });
    }
    onOnce(window, 'scroll', tick);
    tick();
  }

  // Public API for other modules/partials-loader
  Z.initNav = initNav;

  Z.autoInit = function autoInit() {
    initButtons();
    initScrollAnimations();
    const headerScope = document.getElementById('zzx-header') || document;
    initNav(headerScope);
    booted = true;
  };

  // Auto-load partials loader (no extra <script> needed in HTML)
  (async function loadModules() {
    try {
      const base = resolveThisBase(); // '/static/js'
      await load(`${base}/modules/partials-loader.js`); // '/static/js/modules/partials-loader.js'
    } catch (err) {
      console.warn('partials-loader.js failed to load:', err && err.message ? err.message : err);
    }
  })();

  // Ensure init runs at least once even if wrapper didn’t call it
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof Z.autoInit === 'function') Z.autoInit();
    });
  } else {
    if (typeof Z.autoInit === 'function') Z.autoInit();
  }
})();
