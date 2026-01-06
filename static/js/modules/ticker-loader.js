// /static/js/modules/ticker-loader.js
// DROP-IN REPLACEMENT (SINGLE ORCHESTRATOR: widget-core)
//
// FIXES (NO new files, no new routes, no runtime.js):
// 1) Race-proof remount: if partials/header reinjection replaces #ticker-container AFTER first boot,
//    we detect it and reinject wrapper + re-run hud-state + core boot.
// 2) CSS-stability: wait for WRAP_CSS + CORE_CSS to finish loading before injecting wrapper HTML.
//    This stops the “raw white left-aligned flash / unstyled ticker” behavior.
// 3) Still strict order: CSS -> HTML -> hud-state -> widget-core.
//
// NOTE: Keeps your existing globals + patterns. Only refactors inside this file.

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Allow a single "controller" install, but we still remount on DOM replacement.
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

  // IMPORTANT: return a Promise that resolves when CSS is actually loaded.
  function loadCSSOnce(href) {
    const h = withV(href);
    const key = "zzxcss:" + keyify(h);

    const existing = D.querySelector(`link[data-zzx-css="${key}"]`);
    if (existing) {
      // If already loaded (or loading), resolve safely.
      if (existing.dataset.zzxLoaded === "1") return Promise.resolve(true);

      return new Promise((resolve) => {
        const done = () => {
          existing.dataset.zzxLoaded = "1";
          resolve(true);
        };
        existing.addEventListener("load", done, { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });

        // Fallback: some browsers don’t reliably fire load for cached CSS
        setTimeout(() => resolve(true), 800);
      });
    }

    return new Promise((resolve) => {
      const l = D.createElement("link");
      l.rel = "stylesheet";
      l.href = h;
      l.setAttribute("data-zzx-css", key);
      l.onload = () => { l.dataset.zzxLoaded = "1"; resolve(true); };
      l.onerror = () => resolve(false);
      D.head.appendChild(l);

      // Fallback: don’t hang boot if browser never fires onload
      setTimeout(() => resolve(true), 800);
    });
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
  // Remount detection
  // - If #ticker-container gets replaced after initial boot, re-run boot.
  // ----------------------------
  function needsMount(mount) {
    if (!mount) return false;
    // Wrapper inject creates [data-hud-root] inside mount; if missing, we need reinject.
    return !mount.querySelector("[data-hud-root]") && !mount.querySelector(".btc-rail");
  }

  // ----------------------------
  // Boot (strict order)
  // ----------------------------
  let __booting = false;

  async function bootOnceForCurrentMount() {
    if (__booting) return;
    __booting = true;

    try {
      await waitForPartials();

      const mount = D.getElementById("ticker-container");
      if (!mount) return;

      // If already mounted, do nothing (but still allow widget-core boot to re-run safely)
      if (!needsMount(mount)) {
        try { W.ZZXWidgetsCore?.boot?.(); } catch (_) {}
        return;
      }

      // 1) CSS FIRST and WAIT (prevents raw/unstyled)
      const okWrapCss = await loadCSSOnce(WRAP_CSS);
      if (!okWrapCss) console.warn("[ticker-loader] wrapper CSS failed:", WRAP_CSS);

      const okCoreCss = await loadCSSOnce(CORE_CSS);
      if (!okCoreCss) console.warn("[ticker-loader] core CSS failed:", CORE_CSS);

      // 2) wrapper HTML (slots)
      const html = await fetchHTML(WRAP_HTML);
      injectHTML(mount, html);

      // 3) hud-state first (so hide/unhide is correct)
      const okHud = await loadJSOnce(HUD_STATE);
      if (!okHud) console.warn("[ticker-loader] hud-state failed:", HUD_STATE);

      // 4) core orchestrator (manifest mounts widgets, boots them)
      const okCore = await loadJSOnce(CORE_JS);
      if (!okCore) console.warn("[ticker-loader] widget-core failed:", CORE_JS);

      // 5) kick core if it exposes boot (safe)
      try { W.ZZXWidgetsCore?.boot?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    } finally {
      __booting = false;
    }
  }

  // Initial boot
  bootOnceForCurrentMount();

  // Observe for late reinjection of #ticker-container or its contents being replaced
  try {
    const mo = new MutationObserver(() => {
      const mount = D.getElementById("ticker-container");
      if (mount && needsMount(mount)) bootOnceForCurrentMount();
    });
    mo.observe(D.documentElement, { childList: true, subtree: true });
    D.__zzxTickerLoaderObserver = mo;
  } catch (_) {}
})();
