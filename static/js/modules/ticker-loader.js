// /static/js/modules/ticker-loader.js
// ZZX Bitcoin HUD + Widget Orchestrator (AUTHORITATIVE) — DROP-IN REPLACEMENT
//
// GOAL: make this work EVERY time, on EVERY page depth.
//
// Contract:
// - ticker-loader injects wrapper CSS (primitives) FIRST
// - injects wrapper HTML (slots)
// - loads hud-state.js (single source of truth)
// - loads runtime.js (manifest-driven mounter + HUD binder)
// - NEVER uses ../
// - Idempotent (safe across reinjections)
//
// REQUIRED FILES THAT MUST EXIST (exact paths):
//   /__partials/bitcoin-ticker-widget.html
//   /__partials/bitcoin-ticker-widget.css
//   /__partials/widgets/hud-state.js
//   /__partials/widgets/runtime.js
//   /__partials/widgets/manifest.json
//
// NOTE: runtime.js will show an in-card error if a widget JS/CSS/HTML is missing.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ----------------------------
  // Prefix-safe URL join
  // ----------------------------
  function getPrefix() {
    if (typeof W.ZZX?.PREFIX === "string") return W.ZZX.PREFIX;
    const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
    if (htmlPrefix) return htmlPrefix;
    return "";
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    if (/^https?:\/\//i.test(s)) return s;     // absolute URL
    if (!s.startsWith("/")) return s;          // non-absolute path (shouldn't be used here)

    const p = String(prefix || "").replace(/\/+$/, "");
    if (!p || p === "." || p === "/") return s;
    return p + s;
  }

  const PREFIX = getPrefix();
  W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX });

  // ----------------------------
  // Versioning
  // ----------------------------
  function assetVersion() {
    const v = D.querySelector('meta[name="asset-version"]')?.getAttribute("content");
    return (v || "").trim();
  }

  function withV(u) {
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
  // Assets (canonical)
  // ----------------------------
  const WRAP_HTML   = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const WRAP_CSS    = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");
  const HUD_STATE   = join(PREFIX, "/__partials/widgets/hud-state.js");
  const RUNTIME_JS  = join(PREFIX, "/__partials/widgets/runtime.js");
  const MANIFEST    = join(PREFIX, "/__partials/widgets/manifest.json");

  // publish manifest URL (optional)
  W.__ZZX_WIDGETS_MANIFEST_URL = MANIFEST;

  // ----------------------------
  // Idempotent injectors
  // ----------------------------
  function keyify(s) {
    return btoa(unescape(encodeURIComponent(String(s)))).replace(/=+$/g, "");
  }

  function loadCSSOnce(href) {
    const h = withV(href);
    const key = "zzxcss:" + keyify(h);
    if (D.querySelector(`link[data-zzx-css="${key}"]`)) return;

    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = h;
    l.setAttribute("data-zzx-css", key);
    D.head.appendChild(l);
  }

  function loadJSOnce(src) {
    const s0 = withV(src);
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
    const u = withV(url);
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTML fetch failed ${r.status}: ${u}`);
    return await r.text();
  }

  function injectHTML(mountEl, htmlText) {
    mountEl.replaceChildren();
    const tpl = D.createElement("template");
    tpl.innerHTML = htmlText;
    mountEl.appendChild(tpl.content);
  }

  // ----------------------------
  // Wait for partials injection (correct emitter = window)
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
  // Boot (strict order)
  // ----------------------------
  (async function boot() {
    try {
      await waitForPartials();

      const mount = D.getElementById("ticker-container");
      if (!mount) return;

      // 1) primitives CSS FIRST (fixes “raw white ticker”)
      loadCSSOnce(WRAP_CSS);

      // 2) wrapper HTML (slots)
      const html = await fetchHTML(WRAP_HTML);
      injectHTML(mount, html);

      // 3) hud-state then runtime (so hide/unhide always works)
      const okHud = await loadJSOnce(HUD_STATE);
      if (!okHud) console.warn("[ticker-loader] hud-state failed:", HUD_STATE);

      const okRt = await loadJSOnce(RUNTIME_JS);
      if (!okRt) console.warn("[ticker-loader] runtime failed:", RUNTIME_JS);

      // 4) kick legacy start (safe)
      try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    }
  })();
})();
