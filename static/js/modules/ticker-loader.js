// static/js/modules/ticker-loader.js
// DROP-IN REPLACEMENT
//
// Boots the entire HUD stack reliably (core CSS+JS, HUD state, runtime),
// prefix-aware (works from any depth / GH Pages / subpaths),
// and mounts the runtime shell into #btc-ticker (never overwrites #ticker-container).
//
// Fixes the “containers show but data never loads” failure mode by guaranteeing:
//  1) _core/widget-core.css is loaded
//  2) _core/widget-core.js is loaded BEFORE runtime.js
//  3) hud-state.js is loaded BEFORE runtime widget binds buttons/state
//  4) runtime.html is mounted, then runtime.js runs
//
// NOTE: This file intentionally does NOT try to load every widget here.
// runtime.js should mount widgets from __partials/widgets/manifest.json.

(function () {
  const W = window;

  // Prevent double-boot across reinjections
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ---------------- prefix-aware URL builder ----------------
  // partials-loader sets: window.ZZX = { PREFIX: '.' | '..' | ... | '/' }
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (prefix === "/") return path;            // site root hosting
    if (!path.startsWith("/")) return path;     // already relative
    return prefix.replace(/\/+$/, "") + path;
  }

  function hrefs() {
    const prefix = getPrefix();
    return {
      // Core styling for HUD + shared widget card styles
      CORE_CSS: join(prefix, "/__partials/widgets/_core/widget-core.css"),

      // Runtime shell + boot logic
      RUNTIME_HTML: join(prefix, "/__partials/widgets/runtime.html"),
      HUD_STATE_JS: join(prefix, "/__partials/widgets/hud-state.js"),
      CORE_JS:      join(prefix, "/__partials/widgets/_core/widget-core.js"),
      RUNTIME_JS:   join(prefix, "/__partials/widgets/runtime.js"),
    };
  }

  // ---------------- DOM injection helpers ----------------
  function ensureCSS(href, marker) {
    const sel = `link[data-zzx-css="${marker}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", marker);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(src, marker) {
    const sel = `script[data-zzx-js="${marker}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", marker);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function mountRuntimeShell(runtimeHtmlUrl) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // Already mounted? fine.
    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) return true;

    // Prevent overlapping loads
    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(runtimeHtmlUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime.html HTTP ${r.status}`);
      const html = await r.text();
      mount.innerHTML = html;
      container.dataset.tickerLoaded = "1";
      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  // ---------------- boot + retry strategy ----------------
  let mo = null;
  let retryTimer = null;

  async function tryBootOnce() {
    const { CORE_CSS, RUNTIME_HTML, HUD_STATE_JS, CORE_JS, RUNTIME_JS } = hrefs();

    // Always inject core CSS first
    ensureCSS(CORE_CSS, "widgets-core");

    try {
      const mounted = await mountRuntimeShell(RUNTIME_HTML);
      if (!mounted) return false;

      // CRITICAL: load scripts in dependency order
      const okHud  = await ensureScriptOnce(HUD_STATE_JS, "hud-state");
      const okCore = await ensureScriptOnce(CORE_JS, "widgets-core");
      const okRun  = await ensureScriptOnce(RUNTIME_JS, "widgets-runtime");

      // If any script failed, runtime won’t load widgets
      if (!okHud || !okCore || !okRun) {
        // allow retries
        const container = document.getElementById("ticker-container");
        if (container) container.dataset.tickerLoaded = "0";
        return false;
      }

      return true;
    } catch (e) {
      console.warn("HUD loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
      return false;
    }
  }

  function startWatchingForMount() {
    if (mo) return;

    // retry even without DOM mutations (slow networks)
    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      }, 700);
    }

    // observe DOM changes (partials-loader injection)
    mo = new MutationObserver(async () => {
      const ok = await tryBootOnce();
      if (ok) stopWatching();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (mo) { mo.disconnect(); mo = null; }
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }

  async function boot() {
    const ok = await tryBootOnce();
    if (!ok) startWatchingForMount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
