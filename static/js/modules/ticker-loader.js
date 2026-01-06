// /static/js/modules/ticker-loader.js
// DROP-IN REPLACEMENT (SINGLE ORCHESTRATOR: widget-core)
// - Inject wrapper CSS first
// - Inject wrapper HTML (slots)
// - Load hud-state
// - Load widget-core (manifest mounter)
// - DOES NOT load runtime.js

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
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
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
  const WRAP_HTML  = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const WRAP_CSS   = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");
  const HUD_STATE  = join(PREFIX, "/__partials/widgets/hud-state.js");

  // SINGLE orchestrator:
  const CORE_CSS   = join(PREFIX, "/__partials/widgets/_core/widget-core.css");
  const CORE_JS    = join(PREFIX, "/__partials/widgets/_core/widget-core.js");

  // Publish manifest URL for core (optional; core can also hardcode it)
  W.__ZZX_WIDGETS_MANIFEST_URL = join(PREFIX, "/__partials/widgets/manifest.json");

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
  // Wait for partials injection
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

      // 1) primitives CSS FIRST (prevents raw/unstyled flashes)
      loadCSSOnce(WRAP_CSS);

      // 2) core CSS (layout + slot/grid rules)
      loadCSSOnce(CORE_CSS);

      // 3) wrapper HTML (slots)
      const html = await fetchHTML(WRAP_HTML);
      injectHTML(mount, html);

      // 4) hud-state first (so hide/unhide is correct)
      const okHud = await loadJSOnce(HUD_STATE);
      if (!okHud) console.warn("[ticker-loader] hud-state failed:", HUD_STATE);

      // 5) core orchestrator (manifest mounts widgets, boots them)
      const okCore = await loadJSOnce(CORE_JS);
      if (!okCore) console.warn("[ticker-loader] widget-core failed:", CORE_JS);

      // 6) kick core if it exposes boot (safe)
      try { W.ZZXWidgetsCore?.boot?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    }
  })();
})();
