// /static/js/script.js
// Sitewide orchestrator (partials + nav + ticker/HUD) — hardened against race + 404s.
// Goals:
// - Never “take the whole site down” if a module 404s
// - Ensure nav binds AFTER partials injection (and re-binds safely)
// - Keep duplicate-safe behavior

(function () {
  const Z = (window.ZZXSite = window.ZZXSite || {});
  let booted = false;

  // Resolve this script's own base path (e.g., '/static/js')
  function resolveThisBase() {
    const s = document.currentScript;
    if (!s || !s.src) return "/static/js";
    try {
      const url = new URL(s.src, location.href);
      url.pathname = url.pathname.replace(/\/[^/]*$/, ""); // strip filename
      return url.pathname || "/static/js";
    } catch (_) {
      return "/static/js";
    }
  }

  // Optional asset version passthrough: <meta name="asset-version" content="...">
  function assetVersion() {
    const el = document.querySelector('meta[name="asset-version"]');
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  function withBust(src) {
    const v = assetVersion();
    if (!v) return src;
    try {
      const u = new URL(src, location.href);
      if (!u.searchParams.has("v")) u.searchParams.set("v", v);
      return u.href;
    } catch (_) {
      return src;
    }
  }

  function alreadyLoaded(srcAbs) {
    const want = (() => {
      try { return new URL(srcAbs, location.href).pathname; } catch { return srcAbs; }
    })();
    return Array.from(document.scripts).some((s) => {
      if (!s.src) return false;
      try { return new URL(s.src, location.href).pathname === want; } catch { return s.src === srcAbs; }
    });
  }

  function load(src) {
    // NON-FATAL loader: resolves false on error (never throws up-stack)
    const href = withBust(src);
    if (alreadyLoaded(href)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const el = document.createElement("script");
      el.src = href;
      el.defer = true;
      el.onload = () => resolve(true);
      el.onerror = () => {
        console.warn("[/static/js/script.js] module failed:", href);
        resolve(false);
      };
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

    Array.from(scope.querySelectorAll(".submenu-toggle")).forEach((btn) => {
      onOnce(btn, "click", () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains("submenu")) {
          ul.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });

    Array.from(scope.querySelectorAll('a[href^="#"]')).forEach((link) => {
      onOnce(link, "click", (e) => {
        e.preventDefault();
        const id = link.getAttribute("href").slice(1);
        const target = document.getElementById(id);
        if (!target) return;

        window.scrollTo({ top: target.offsetTop - 60, behavior: "smooth" });

        if (links && links.classList.contains("open")) {
          links.classList.remove("open");
          if (toggle) toggle.setAttribute("aria-expanded", "false");
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
    booted = true;
  };

  // Re-run nav binding after partials injection (race-proof, idempotent)
  if (!window.__ZZX_PARTIALS_READY_LISTENER) {
    window.__ZZX_PARTIALS_READY_LISTENER = true;
    window.addEventListener("zzx:partials-ready", () => {
      try { Z.autoInit(); } catch (_) {}
    });
  }

  // Auto-load modules so pages only include /static/script.js
  (async function loadModules() {
    const base = resolveThisBase(); // '/static/js'
    // 1) Partials loader (injects header/nav/footer and emits zzx:partials-ready)
    await load(`${base}/modules/partials-loader.js`);
    // 2) Ticker/HUD loader
    await load(`${base}/modules/ticker-loader.js`);

    // After modules load, run init again (safe)
    try { Z.autoInit(); } catch (_) {}
  })();

  // Ensure init runs at least once even if wrappers didn’t call it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { Z.autoInit(); } catch (_) {}
    }, { once: true });
  } else {
    try { Z.autoInit(); } catch (_) {}
  }
})();
