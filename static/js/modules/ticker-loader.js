// /static/js/modules/ticker-loader.js
// ZZX Bitcoin HUD + Widget Orchestrator (AUTHORITATIVE) — DROP-IN REPLACEMENT
//
// GOAL: work EVERY time, on EVERY page depth.
//
// Contract:
// - inject wrapper CSS FIRST (primitives)
// - inject wrapper HTML (slots)
// - load hud-state.js (single source of truth)
// - load runtime.js (manifest-driven mounter + HUD binder)
// - NEVER uses ../
// - Idempotent (safe across reinjections)
//
// REQUIRED FILES (exact paths):
//   /__partials/bitcoin-ticker-widget.html
//   /__partials/bitcoin-ticker-widget.css
//   /__partials/widgets/hud-state.js
//   /__partials/widgets/runtime.js
//   /__partials/widgets/manifest.json
//
// HARD FIXES VS YOUR CURRENT BEHAVIOR:
// - Guarantees wrapper CSS is in the DOM *before* wrapper HTML is injected.
// - Waits for CSS load completion so you don’t get “raw white ticker” flashes.
// - Re-runs when ticker-container appears later (partials race / reinjection).
// - Executes wrapper <script> tags IF they exist (safe; no-ops if none).
// - Uses stable dedupe keys by URL pathname (ignores ?v= changes).
// - Publishes __ZZX_WIDGETS_MANIFEST_URL without double-appending ?v.

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Idempotent across reinjections
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ----------------------------
  // Prefix-safe URL join
  // ----------------------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string") return p;
    const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof htmlPrefix === "string" && htmlPrefix.length) return htmlPrefix;
    return "";
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    if (/^https?:\/\//i.test(s)) return s; // absolute URL
    if (!s.startsWith("/")) return s;      // should not happen for our canonical paths

    const p = String(prefix || "").replace(/\/+$/, "");
    if (!p || p === "." || p === "/") return s;
    return p + s;
  }

  const PREFIX = getPrefix();
  W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX });

  // ----------------------------
  // Asset versioning (?v=...)
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

  function samePath(a, b) {
    try {
      const A = new URL(a, location.href);
      const B = new URL(b, location.href);
      return A.origin === B.origin && A.pathname === B.pathname;
    } catch {
      return a === b;
    }
  }

  // ----------------------------
  // Assets (canonical)
  // ----------------------------
  const WRAP_HTML  = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const WRAP_CSS   = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");
  const HUD_STATE  = join(PREFIX, "/__partials/widgets/hud-state.js");
  const RUNTIME_JS = join(PREFIX, "/__partials/widgets/runtime.js");
  const MANIFEST   = join(PREFIX, "/__partials/widgets/manifest.json");

  // publish manifest URL (runtime.js may use it)
  W.__ZZX_WIDGETS_MANIFEST_URL = MANIFEST;

  // ----------------------------
  // Idempotent injectors (dedupe by pathname)
  // ----------------------------
  function cssAlreadyLoaded(hrefAbs) {
    return Array.from(D.querySelectorAll("link[rel='stylesheet']")).some((l) => {
      const h = l.getAttribute("href");
      return h && samePath(h, hrefAbs);
    });
  }

  function scriptAlreadyLoaded(srcAbs) {
    return Array.from(D.scripts).some((s) => s.src && samePath(s.src, srcAbs));
  }

  function loadCSSOnce(href) {
    const hrefAbs = withV(href);
    if (cssAlreadyLoaded(hrefAbs)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const l = D.createElement("link");
      l.rel = "stylesheet";
      l.href = hrefAbs;
      l.onload = () => resolve(true);
      l.onerror = () => resolve(false);
      D.head.appendChild(l);
    });
  }

  function loadJSOnce(src) {
    const srcAbs = withV(src);
    if (scriptAlreadyLoaded(srcAbs)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = D.createElement("script");
      s.src = srcAbs;
      s.defer = true;
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

  // Inject HTML and execute any inline/external scripts contained in it
  // (innerHTML/template does NOT execute scripts; this fixes “wrapper JS didn’t run” if present)
  function injectHTMLExecuteScripts(mountEl, htmlText) {
    mountEl.replaceChildren();

    const tpl = D.createElement("template");
    tpl.innerHTML = htmlText;

    const scripts = Array.from(tpl.content.querySelectorAll("script"));
    scripts.forEach((sc) => sc.remove());

    mountEl.appendChild(tpl.content);

    for (const old of scripts) {
      const s = D.createElement("script");
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
      if (old.src) s.src = withV(old.src);
      else s.textContent = old.textContent || "";
      mountEl.appendChild(s);
    }
  }

  // ----------------------------
  // Wait for partials injection (emitter = window)
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
  // Boot step (runs once per “mount appearance”)
  // ----------------------------
  let __zzxBooting = false;
  let __zzxBootedOnceForNode = new WeakSet();

  async function bootInto(mount) {
    if (!mount) return;
    if (__zzxBootedOnceForNode.has(mount)) return;

    // Guard against concurrent boots
    if (__zzxBooting) return;
    __zzxBooting = true;

    try {
      // 1) primitives CSS FIRST — and wait until it is LOADED
      //    (this kills “raw white ticker”)
      const okCss = await loadCSSOnce(WRAP_CSS);
      if (!okCss) console.warn("[ticker-loader] wrapper css failed:", WRAP_CSS);

      // 2) wrapper HTML (slots) — execute scripts if wrapper contains any
      const html = await fetchHTML(WRAP_HTML);
      injectHTMLExecuteScripts(mount, html);

      // Mark this mount as handled so reinjection doesn’t loop
      __zzxBootedOnceForNode.add(mount);

      // 3) hud-state then runtime (hide/unhide must always work)
      const okHud = await loadJSOnce(HUD_STATE);
      if (!okHud) console.warn("[ticker-loader] hud-state failed:", HUD_STATE);

      const okRt = await loadJSOnce(RUNTIME_JS);
      if (!okRt) console.warn("[ticker-loader] runtime failed:", RUNTIME_JS);

      // 4) Kick legacy start (safe)
      try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
      try { W.ZZXWidgetsCore?.boot?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    } finally {
      __zzxBooting = false;
    }
  }

  function observeForTickerContainer() {
    if (D.__zzxTickerLoaderObserver) return;

    const mo = new MutationObserver(() => {
      const mount = D.getElementById("ticker-container");
      if (mount) bootInto(mount);
    });

    mo.observe(D.documentElement, { childList: true, subtree: true });
    D.__zzxTickerLoaderObserver = mo;
  }

  // ----------------------------
  // Boot (strict order)
  // ----------------------------
  (async function boot() {
    await waitForPartials();

    const mount = D.getElementById("ticker-container");
    if (mount) {
      bootInto(mount);
    } else {
      // If container is injected later, watch for it.
      observeForTickerContainer();
    }
  })();
})();
