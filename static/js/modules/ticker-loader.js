// /static/js/modules/ticker-loader.js
// ZZX Bitcoin HUD + Widget Orchestrator (AUTHORITATIVE) — DROP-IN REPLACEMENT
//
// THIS FIXES YOUR TWO REAL FAILURES:
//
// 1) “Ticker renders raw white HTML (no CSS)”: we FORCE-load the wrapper primitives CSS
//    BEFORE injecting wrapper HTML, every time, prefix-safe.
// 2) “Hide makes HUD disappear with no unhide button”: we ALSO FORCE-load
//    /__partials/widgets/hud-state.js + /__partials/widgets/runtime.js
//    (the code that toggles the handle + persists mode) AFTER wrapper injection.
//    No reliance on <script> tags inside wrapper HTML.
//
// Architecture kept (manifest-first):
// - ticker-loader injects ONLY the HUD wrapper HTML+CSS
// - then loads hud-state.js (single source of truth)
// - then loads runtime.js (manifest-driven widget mount + HUD binding)
// - runtime.js loads widget HTML/CSS/JS from /__partials/widgets/<id>/
//
// IMPORTANT:
// - This file is prefix-safe and idempotent.
// - It NEVER uses ../ paths. Ever.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ----------------------------
  // Prefix (single source)
  // ----------------------------
  function getPrefix() {
    if (typeof W.ZZX?.PREFIX === "string") return W.ZZX.PREFIX;
    const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
    if (htmlPrefix) return htmlPrefix;
    return ""; // domain root
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    // absolute URL
    if (/^https?:\/\//i.test(s)) return s;

    // only join absolute-paths
    if (!s.startsWith("/")) return s;

    const p = String(prefix || "").replace(/\/+$/, "");
    if (!p || p === ".") return s;
    if (p === "/") return s;
    return p + s;
  }

  const PREFIX = getPrefix();
  W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX });

  // ----------------------------
  // Assets (CANONICAL PATHS)
  // ----------------------------
  const HUD_WRAPPER_HTML = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const HUD_WRAPPER_CSS  = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");

  // Single source of truth for HUD mode (your file path, not runtime/hud-state.js)
  const HUD_STATE_JS     = join(PREFIX, "/__partials/widgets/hud-state.js");

  // Manifest-driven widget runtime
  const RUNTIME_JS       = join(PREFIX, "/__partials/widgets/runtime.js");

  // Publish canonical manifest URL for runtime.js (optional; harmless)
  W.__ZZX_WIDGETS_MANIFEST_URL = join(PREFIX, "/__partials/widgets/manifest.json");

  // ----------------------------
  // Versioning
  // ----------------------------
  function assetVersion() {
    const v = D.querySelector('meta[name="asset-version"]')?.getAttribute("content");
    return (v || "").trim();
  }

  function withBust(u) {
    const v = assetVersion();
    if (!v) return u;
    try {
      const U = new URL(u, location.href);
      if (!U.searchParams.has("v")) U.searchParams.set("v", v);
      return U.href;
    } catch {
      return u;
    }
  }

  // ----------------------------
  // Idempotent loaders
  // ----------------------------
  function keyify(s) {
    return btoa(unescape(encodeURIComponent(String(s)))).replace(/=+$/g, "");
  }

  function loadCSSOnce(href) {
    const h = withBust(href);
    const key = "zzxcss:" + keyify(h);
    if (D.querySelector(`link[data-zzx-css="${key}"]`)) return;

    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = h;
    l.setAttribute("data-zzx-css", key);
    D.head.appendChild(l);
  }

  function loadJSOnce(src) {
    const s0 = withBust(src);
    const key = "zzxjs:" + keyify(s0);

    return new Promise((resolve) => {
      if (D.querySelector(`script[data-zzx-js="${key}"]`)) return resolve(true);

      const s = D.createElement("script");
      s.src = s0;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      D.head.appendChild(s);
    });
  }

  async function fetchHTML(url) {
    const u = withBust(url);
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTML fetch failed ${r.status}: ${u}`);
    return await r.text();
  }

  // ----------------------------
  // Inject HTML (NO script exec reliance)
  // ----------------------------
  function injectHTML(mountEl, htmlText) {
    mountEl.replaceChildren();
    const tpl = D.createElement("template");
    tpl.innerHTML = htmlText;
    mountEl.appendChild(tpl.content);
  }

  // ----------------------------
  // Wait for partials-loader (window is emitter)
  // ----------------------------
  function waitForPartials(timeoutMs = 3500) {
    if (W.__zzx_partials_ready) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(!!ok);
      };

      const onEvt = () => {
        W.__zzx_partials_ready = true;
        finish(true);
      };

      W.addEventListener("zzx:partials:ready", onEvt, { once: true });
      W.addEventListener("zzx:partials-ready", onEvt, { once: true });

      const t0 = performance.now();
      (function poll() {
        if (done) return;
        const h = D.getElementById("zzx-header");
        if (h && h.childNodes && h.childNodes.length) return finish(true);
        if (performance.now() - t0 >= timeoutMs) return finish(false);
        setTimeout(poll, 60);
      })();
    });
  }

  // ----------------------------
  // Boot (STRICT ORDER)
  // ----------------------------
  (async function boot() {
    try {
      await waitForPartials();

      const mount = D.getElementById("ticker-container");
      if (!mount) return;

      // 1) CSS FIRST (fixes “raw ticker HTML”)
      loadCSSOnce(HUD_WRAPPER_CSS);

      // 2) Inject wrapper HTML (slots)
      const html = await fetchHTML(HUD_WRAPPER_HTML);
      injectHTML(mount, html);

      // 3) Load HUD state + runtime (so hide/show ALWAYS works)
      const okHud = await loadJSOnce(HUD_STATE_JS);
      if (!okHud) console.warn("[ticker-loader] failed to load hud-state.js:", HUD_STATE_JS);

      const okRt = await loadJSOnce(RUNTIME_JS);
      if (!okRt) console.warn("[ticker-loader] failed to load runtime.js:", RUNTIME_JS);

      // 4) Kick start (safe; runtime may already self-boot)
      try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    }
  })();
})();
