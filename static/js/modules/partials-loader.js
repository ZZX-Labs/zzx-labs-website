// /static/js/modules/partials-loader.js
// ZZX Partials Loader (ROOT-RELATIVE, DEPTH-SAFE)
// Fixes the “https://__partials/…” CORS failure by NEVER emitting protocol-relative URLs (//__partials/...).
// Loads header/nav/footer from /__partials/... and injects them into #zzx-header / #zzx-footer.
// Ticker/HUD is NOT handled here.

(function () {
  const W = window;

  // idempotent
  if (W.__ZZX_PARTIALS_LOADER_BOOTED) return;
  W.__ZZX_PARTIALS_LOADER_BOOTED = true;

  // ROOT-relative (works from any page depth on zzx-labs.io)
  const URLS = {
    header: "/__partials/header/header.html",
    nav:    "/__partials/nav/nav.html",
    footer: "/__partials/footer/footer.html",
  };

  // Expose a stable prefix for other modules (ticker-loader/runtime) without breaking root hosting.
  // Use "" (empty) to mean “domain root”; DO NOT use "/" to avoid accidental '//' joins elsewhere.
  W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX: "" });

  // Optional debug attr (safe)
  try { document.documentElement.setAttribute("data-zzx-prefix", ""); } catch (_) {}

  function emitReady() {
    try {
      W.dispatchEvent(new CustomEvent("zzx:partials-ready", { detail: { prefix: "" } }));
    } catch (_) {}
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function ensureHost(id, where) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement("div");
    el.id = id;
    if (where === "prepend") document.body.prepend(el);
    else document.body.appendChild(el);
    return el;
  }

  function injectNavIntoHeader(headerHTML, navHTML) {
    const marker = "<!-- navbar Here -->";
    if (headerHTML.includes(marker)) return headerHTML.replace(marker, navHTML);

    // fallback: try to place nav near end of header wrapper
    const idx = headerHTML.lastIndexOf("</header>");
    if (idx !== -1) {
      return headerHTML.slice(0, idx) + "\n" + navHTML + "\n" + headerHTML.slice(idx);
    }
    return headerHTML + "\n" + navHTML;
  }

  // Wait briefly for sitewide initializer to exist (prevents double-binding / races)
  function waitForSitewideInit(timeoutMs = 1400, intervalMs = 60) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function poll() {
        if (W.ZZXSite && typeof W.ZZXSite.initNav === "function") return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        setTimeout(poll, intervalMs);
      })();
    });
  }

  // Minimal fallback nav UX (only if ZZXSite.initNav never appears)
  function fallbackInitNav(scope) {
    const root = scope || document;
    const toggle = root.querySelector("#navbar-toggle") || document.getElementById("navbar-toggle");
    const links  = root.querySelector("#navbar-links")  || document.getElementById("navbar-links");
    const body   = document.body;

    if (toggle && links && !toggle.__zzx_bound) {
      toggle.__zzx_bound = true;
      toggle.addEventListener("click", () => {
        const isOpen = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        links.setAttribute("aria-hidden", isOpen ? "false" : "true");
        body.classList.toggle("no-scroll", isOpen);
      });
    }

    root.querySelectorAll(".submenu-toggle").forEach((btn) => {
      if (btn.__zzx_bound) return;
      btn.__zzx_bound = true;
      btn.addEventListener("click", () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains("submenu")) {
          ul.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });
  }

  async function boot() {
    emitReady();

    const headerHost = ensureHost("zzx-header", "prepend");
    const footerHost = ensureHost("zzx-footer", "append");

    try {
      const [headerHTML, navHTML, footerHTML] = await Promise.all([
        fetchText(URLS.header),
        fetchText(URLS.nav),
        fetchText(URLS.footer),
      ]);

      // Compose header + nav
      const composedHeader = injectNavIntoHeader(headerHTML, navHTML);

      // Inject
      const headerWrap = document.createElement("div");
      headerWrap.innerHTML = composedHeader;
      headerHost.replaceChildren(...headerWrap.childNodes);

      const footerWrap = document.createElement("div");
      footerWrap.innerHTML = footerHTML;
      footerHost.replaceChildren(...footerWrap.childNodes);

      // Prefer sitewide initializer; fallback only if it never arrives
      const hasSitewide = await waitForSitewideInit();
      if (hasSitewide) {
        try { W.ZZXSite.initNav(headerHost); } catch (_) {}
        try { if (typeof W.ZZXSite.autoInit === "function") W.ZZXSite.autoInit(); } catch (_) {}
      } else {
        fallbackInitNav(headerHost);
      }
    } catch (e) {
      // Don’t nuke the page if partials aren’t reachable; just log.
      console.warn("[partials-loader] failed:", e && e.message ? e.message : e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
