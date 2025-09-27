// /static/js/script.js
(function () {
  const Z = (window.ZZXSite = window.ZZXSite || {});
  let booted = false;

  // Helper: attach once per element
  function onOnce(el, type, handler, opts) {
    const key = `__bound_${type}`;
    if (el[key]) return;
    el.addEventListener(type, handler, opts);
    el[key] = true;
  }

  // Initialize NAV UX inside a given scope (defaults to document)
  function initNav(scope = document) {
    // Prefer elements inside the injected header scope
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

    // Submenus
    (scope.querySelectorAll('.submenu-toggle') || []).forEach(btn => {
      onOnce(btn, 'click', (e) => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains('submenu')) {
          ul.classList.toggle('open');
          btn.classList.toggle('open');
        }
      });
    });

    // Smooth anchors
    (scope.querySelectorAll('a[href^="#"]') || []).forEach(link => {
      onOnce(link, 'click', (e) => {
        e.preventDefault();
        const id = link.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        window.scrollTo({ top: target.offsetTop - 60, behavior: 'smooth' });

        // Close mobile menu if open
        if (links && links.classList.contains('open')) {
          links.classList.remove('open');
          toggle && toggle.setAttribute('aria-expanded', 'false');
          links.setAttribute('aria-hidden', 'true');
          body.classList.remove('no-scroll');
        }
      });
    });

    // Active state on click (document-wide)
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(a => {
      onOnce(a, 'click', () => {
        navLinksList.forEach(n => n.classList.remove('active'));
        a.classList.add('active');
      });
    });
  }

  // Button hover scaling (document-wide; attach once per button)
  function initButtons() {
    document.querySelectorAll('button').forEach(btn => {
      onOnce(btn, 'mouseover', () => (btn.style.transform = 'scale(1.05)'));
      onOnce(btn, 'mouseout',  () => (btn.style.transform = 'scale(1)'));
      onOnce(btn, 'mousedown', () => (btn.style.transform = 'scale(1)'));
    });
  }

  // Scroll animations (document-wide)
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
    // Initial run
    tick();
  }

  // Public API: called by the wrapper AND by the partials-loader after injection
  Z.initNav = initNav;

  // Idempotent sitewide init
  Z.autoInit = function autoInit() {
    // Always re-init buttons (new buttons may appear)
    initButtons();
    initScrollAnimations();

    // If header already injected, init nav there; otherwise init on document
    const headerScope = document.getElementById('zzx-header') || document;
    initNav(headerScope);

    // Mark booted (purely informational)
    booted = true;
  };
})();
