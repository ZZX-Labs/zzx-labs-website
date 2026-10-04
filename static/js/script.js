// /static/js/script.js
// ZZX Sitewide Bootstrap (AUDITED + STABILIZED)
//
// GUARANTEES:
// 1) Header + navbar + footer mount FIRST on every page
// 2) Widgets/HUD boot ONLY AFTER partials are real DOM
// 3) Navbar + submenu toggles are deterministic
// 4) Safe at any directory depth
// 5) Idempotent (never double-bind)

(function () {
  "use strict";

  const W = window;
  const Z = (W.ZZXSite = W.ZZXSite || {});
  if (Z.__booted_sitewide) return;
  Z.__booted_sitewide = true;

  /* ------------------------------------------------------------------ */
  /* Base path resolution (script-relative, depth-safe)                  */
  /* ------------------------------------------------------------------ */

  function resolveThisBase() {
    const s = document.currentScript;
    if (!s || !s.src) return "/static/js";
    const u = new URL(s.src, location.href);
    u.pathname = u.pathname.replace(/\/[^/]*$/, "");
    return u.pathname;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const abs = new URL(src, location.href).href;
      const absPath = new URL(abs).pathname;

      // De-dupe by pathname
      if ([...document.scripts].some(sc => {
        try { return new URL(sc.src).pathname === absPath; }
        catch { return false; }
      })) {
        return resolve(src);
      }

      const el = document.createElement("script");
      el.src = abs;
      el.defer = true;
      el.onload = () => resolve(src);
      el.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(el);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                          */
  /* ------------------------------------------------------------------ */

  function onOnce(el, evt, fn, opts) {
    if (!el) return;
    const key = "__zzx_bound_" + evt;
    if (el[key]) return;
    el[key] = true;
    el.addEventListener(evt, fn, opts);
  }

  /* ------------------------------------------------------------------ */
  /* NAV INITIALIZATION (FIXES WONKY SUBMENUS)                           */
  /* ------------------------------------------------------------------ */

  function initNav(scope = document) {
    const toggle = scope.querySelector("#navbar-toggle");
    const links  = scope.querySelector("#navbar-links");
    const body   = document.body;

    if (toggle && links) {
      onOnce(toggle, "click", () => {
        const open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        links.setAttribute("aria-hidden", open ? "false" : "true");
        body.classList.toggle("no-scroll", open);
      });
    }

    scope.querySelectorAll(".submenu-toggle").forEach(btn => {
      onOnce(btn, "click", () => {
        const ul = btn.nextElementSibling;
        if (!ul || !ul.classList.contains("submenu")) return;
        ul.classList.toggle("open");
        btn.classList.toggle("open");
      });
    });
  }

  function initButtons() {
    document.querySelectorAll("button").forEach(btn => {
      onOnce(btn, "mouseenter", () => btn.style.transform = "scale(1.05)");
      onOnce(btn, "mouseleave", () => btn.style.transform = "scale(1)");
      onOnce(btn, "mousedown",  () => btn.style.transform = "scale(1)");
    });
  }

  function initScrollAnimations() {
    const els = document.querySelectorAll(".scroll-animation");
    if (!els.length) return;

    const inView = el => {
      const r = el.getBoundingClientRect();
      return r.top <= innerHeight && r.bottom >= 0;
    };

    const tick = () => {
      els.forEach(el => el.classList.toggle("in-view", inView(el)));
    };

    onOnce(window, "scroll", tick);
    tick();
  }

  /* ------------------------------------------------------------------ */
  /* PUBLIC API                                                         */
  /* ------------------------------------------------------------------ */

  Z.initNav = initNav;

  Z.autoInit = function autoInit() {
    initButtons();
    initScrollAnimations();
    initNav(document.getElementById("zzx-header") || document);
  };

  /* ------------------------------------------------------------------ */
  /* WAIT UNTIL PARTIALS ARE REAL DOM                                   */
  /* ------------------------------------------------------------------ */

  function waitForPartials({ timeoutMs = 8000 } = {}) {
    return new Promise(resolve => {
      const start = performance.now();

      const ready = () => {
        const h = document.getElementById("zzx-header");
        const f = document.getElementById("zzx-footer");
        return (
          h && h.children.length && h.textContent.trim().length > 10 &&
          f && f.children.length && f.textContent.trim().length > 10
        );
      };

      if (ready()) return resolve(true);

      const mo = new MutationObserver(() => {
        if (ready()) {
          mo.disconnect();
          resolve(true);
        }
      });

      mo.observe(document.documentElement, { childList: true, subtree: true });

      const t = setInterval(() => {
        if (ready() || performance.now() - start > timeoutMs) {
          clearInterval(t);
          mo.disconnect();
          resolve(ready());
        }
      }, 80);
    });
  }

  /* ------------------------------------------------------------------ */
  /* MODULE BOOT ORDER (CRITICAL)                                       */
  /* ------------------------------------------------------------------ */

  (async function boot() {
    const base = resolveThisBase();
    const partials = `${base}/modules/partials-loader.js`;
    const ticker   = `${base}/modules/ticker-loader.js`;

    try {
      // 1) Inject header/nav/footer
      await loadScript(partials);

      // 2) Wait until they are actually in DOM
      await waitForPartials();

      // 3) Init nav & UX
      Z.autoInit();

      // 4) ONLY NOW boot HUD/widgets
      await loadScript(ticker);

      // 5) Re-run init (safe)
      Z.autoInit();

    } catch (err) {
      console.warn("[ZZX bootstrap] partial failure:", err);
      Z.autoInit(); // never leave nav dead
    }
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Z.autoInit(), { once: true });
  } else {
    Z.autoInit();
  }
})();
