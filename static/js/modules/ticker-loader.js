// static/js/modules/ticker-loader.js
(function () {
  const W = window;

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || /^https?:\/\//.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function ensureCSS(href, key) {
    if (document.querySelector(`link[data-zzx-css="${key}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-js", key);
    document.body.appendChild(s);
  }

  async function loadHTMLIntoMount(htmlHref) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) return true;
    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(htmlHref, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime shell html HTTP ${r.status}`);
      mount.innerHTML = await r.text();
      container.dataset.tickerLoaded = "1";
      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  async function tryBootOnce() {
    const prefix = getPrefix();

    // ✅ 1) restore legacy styling still used by btc-* markup
    ensureCSS(join(prefix, "/__partials/bitcoin-ticker-widget.css"), "btc-legacy");

    // ✅ 2) core HUD styling
    ensureCSS(join(prefix, "/__partials/widgets/_core/widget-core.css"), "widgets-core");

    // ✅ 3) mount the runtime shell (controls + rail)
    const ok = await loadHTMLIntoMount(join(prefix, "/__partials/widgets/runtime.html"));
    if (!ok) return false;

    // ✅ 4) core runtime dependencies (MUST exist)
    ensureJS(join(prefix, "/__partials/widgets/_core/widget-core.js"), "widgets-core-js");
    ensureJS(join(prefix, "/__partials/widgets/hud-state.js"), "hud-state");
    ensureJS(join(prefix, "/__partials/widgets/runtime.js"), "widgets-runtime");

    return true;
  }

  let mo = null;
  let retryTimer = null;

  function stopWatching() {
    if (mo) { mo.disconnect(); mo = null; }
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }

  function startWatchingForMount() {
    if (mo) return;

    retryTimer = setInterval(async () => {
      try {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      } catch (_) {}
    }, 700);

    mo = new MutationObserver(async () => {
      try {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      } catch (_) {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function boot() {
    try {
      const ok = await tryBootOnce();
      if (!ok) startWatchingForMount();
    } catch (e) {
      console.warn("Ticker loader error:", e);
      startWatchingForMount();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
