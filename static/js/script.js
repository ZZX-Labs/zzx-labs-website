// /static/js/script.js
// ZZX Sitewide Bootstrap (DROP-IN REPLACEMENT)
//
// GOALS (fix what broke):
// 1) Header + navbar + footer MUST mount first (on every page, any depth).
// 2) HUD/widgets MUST boot only AFTER partials are mounted (prevents “widgets render before header”).
// 3) Keep your existing architecture: /static/script.js -> /static/js/script.js -> modules/*
// 4) Idempotent + safe if loaded twice.
//
// NOTES:
// - We do NOT change your partials-loader.js or ticker-loader.js here.
// - We *sequence* them correctly and wait until #zzx-header/#zzx-footer are actually populated.

(function () {
  const Z = (window.ZZXSite = window.ZZXSite || {});
  if (Z.__booted_sitewide) return;
  Z.__booted_sitewide = true;

  // Resolve this script's own base path (e.g., '/static/js')
  function resolveThisBase() {
    const s = document.currentScript;
    if (!s) return "/static/js";
    const url = new URL(s.src, location.href);
    url.pathname = url.pathname.replace(/\/[^/]*$/, "");
    return url.pathname;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // de-dupe by pathname (ignore query)
      const abs = new URL(src, location.href).href;
      const absPath = new URL(abs).pathname;
      const already = Array.from(document.scripts).some((sc) => {
        try { return sc.src && new URL(sc.src).pathname === absPath; } catch { return false; }
      });
      if (already) return resolve(src);

      const el = document.createElement("script");
      el.src = abs;
      el.defer = true;
      el.onload = () => resolve(src);
      el.onerror = () => reject(new Error("Failed to load " + src));
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
    const toggle = scope.querySelector("#navbar-toggle") || document.getElementById("navbar-toggle");
    const links  = scope.querySelector("#navbar-links")  || document.getElementById("navbar-links");
    const body   = document.body;

    if (toggle && links) {
      onOnce(toggle, "click", () => {
        const isOpen = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        links.setAttribute("aria-hidden", isOpen ? "false" : "true");
        body.classList.toggle("no-scroll", isOpen);
      });
    }

    (scope.querySelectorAll(".submenu-toggle") || []).forEach((btn) => {
      onOnce(btn, "click", () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains("submenu")) {
          ul.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });

    (scope.querySelectorAll('a[href^="#"]') || []).forEach((link) => {
      onOnce(link, "click", (e) => {
        e.preventDefault();
        const id = link.getAttribute("href").slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        window.scrollTo({ top: target.offsetTop - 60, behavior: "smooth" });

        if (links && links.classList.contains("open")) {
          links.classList.remove("open");
          toggle && toggle.setAttribute("aria-expanded", "false");
          links.setAttribute("aria-hidden", "true");
          body.classList.remove("no-scroll");
        }
      });
    });

    const navLinksList = document.querySelectorAll(".nav-links a");
    navLinksList.forEach((a) => {
      onOnce(a, "click", () => {
        navLinksList.forEach((n) => n.classList.remove("active"));
        a.classList.add("active");
      });
    });
  }

  function initButtons() {
    document.querySelectorAll("button").forEach((btn) => {
      onOnce(btn, "mouseover", () => (btn.style.transform = "scale(1.05)"));
      onOnce(btn, "mouseout",  () => (btn.style.transform = "scale(1)"));
      onOnce(btn, "mousedown", () => (btn.style.transform = "scale(1)"));
    });
  }

  function initScrollAnimations() {
    const scrollElements = document.querySelectorAll(".scroll-animation");
    function isInViewport(el) {
      const r = el.getBoundingClientRect();
      return r.top <= (window.innerHeight || document.documentElement.clientHeight) && r.bottom >= 0;
    }
    function tick() {
      scrollElements.forEach((el) => {
        if (isInViewport(el)) el.classList.add("in-view");
        else el.classList.remove("in-view");
      });
    }
    onOnce(window, "scroll", tick);
    tick();
  }

  // Public API for other modules/partials-loader
  Z.initNav = initNav;

  Z.autoInit = function autoInit() {
    initButtons();
    initScrollAnimations();
    const headerScope = document.getElementById("zzx-header") || document;
    initNav(headerScope);
  };

  // --- NEW: wait until partials are actually mounted (not just “prefix ready”) ---
  function waitForPartialsMounted({ timeoutMs = 7000 } = {}) {
    return new Promise((resolve) => {
      const t0 = performance.now();

      const isMounted = () => {
        const h = document.getElementById("zzx-header");
        const f = document.getElementById("zzx-footer");
        // “mounted” means the containers exist AND have real content
        const headerOk = !!(h && h.children && h.children.length > 0 && h.textContent.trim().length > 10);
        const footerOk = !!(f && f.children && f.children.length > 0 && f.textContent.trim().length > 10);
        return headerOk && footerOk;
      };

      if (isMounted()) return resolve(true);

      const mo = new MutationObserver(() => {
        if (isMounted()) {
          try { mo.disconnect(); } catch (_) {}
          resolve(true);
        }
      });

      try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

      const timer = setInterval(() => {
        if (isMounted()) {
          clearInterval(timer);
          try { mo.disconnect(); } catch (_) {}
          resolve(true);
          return;
        }
        if (performance.now() - t0 >= timeoutMs) {
          clearInterval(timer);
          try { mo.disconnect(); } catch (_) {}
          // resolve false = partials didn’t mount in time (we still proceed so the page isn't dead)
          resolve(false);
        }
      }, 80);
    });
  }

  // --- NEW: load modules in the ONLY safe order ---
  (async function bootModulesOrdered() {
    const base = resolveThisBase(); // '/static/js'
    const partials = `${base}/modules/partials-loader.js`;
    const ticker   = `${base}/modules/ticker-loader.js`;

    try {
      // 1) Load partials-loader first (it injects header/nav/footer)
      await loadScript(partials);

      // 2) Wait until header/footer are actually in DOM (prevents widgets appearing first)
      await waitForPartialsMounted({ timeoutMs: 8000 });

      // 3) Now run init against the injected header/nav
      try { if (typeof Z.autoInit === "function") Z.autoInit(); } catch (_) {}

      // 4) ONLY NOW boot HUD/ticker (so it doesn't race ahead of header injection)
      await loadScript(ticker);

      // 5) Re-init nav once more (safe/idempotent) in case ticker-loader injected HUD controls etc.
      try { if (typeof Z.autoInit === "function") Z.autoInit(); } catch (_) {}
    } catch (err) {
      console.warn("Site modules failed to load:", err && err.message ? err.message : err);
      // Still attempt basic init so menus/buttons aren’t dead
      try { if (typeof Z.autoInit === "function") Z.autoInit(); } catch (_) {}
    }
  })();

  // Ensure init runs at least once even if wrappers didn’t call it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { if (typeof Z.autoInit === "function") Z.autoInit(); } catch (_) {}
    }, { once: true });
  } else {
    try { if (typeof Z.autoInit === "function") Z.autoInit(); } catch (_) {}
  }
})();
