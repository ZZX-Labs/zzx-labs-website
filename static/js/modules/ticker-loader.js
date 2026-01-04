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
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function hrefs() {
    const prefix = getPrefix();
    return {
      CORE_CSS: join(prefix, "/__partials/widgets/_core/widget-core.css"),
      CORE_JS:  join(prefix, "/__partials/widgets/_core/widget-core.js"),
      HUD_JS:   join(prefix, "/__partials/widgets/hud-state.js"),
      HTML:     join(prefix, "/__partials/widgets/runtime.html"),
      RUNTIME:  join(prefix, "/__partials/widgets/runtime.js"),
    };
  }

  function ensureCSS(href) {
    if (document.querySelector('link[data-zzx-hud-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-hud-css", "1");
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const sel = `script[data-zzx-hud-js="${key}"]`;
    if (document.querySelector(sel)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute("data-zzx-hud-js", key);
    document.body.appendChild(s);
  }

  async function loadHTMLIntoMount(htmlURL) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // don’t remount if already loaded
    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) return true;

    // avoid parallel loads
    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(htmlURL, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime shell html HTTP ${r.status}`);
      const html = await r.text();
      mount.innerHTML = html;
      container.dataset.tickerLoaded = "1";
      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  let mo = null;
  let retryTimer = null;

  async function tryBootOnce() {
    const { CORE_CSS, CORE_JS, HUD_JS, HTML, RUNTIME } = hrefs();

    ensureCSS(CORE_CSS);

    // Ensure deps first
    ensureJS(CORE_JS, "core");
    ensureJS(HUD_JS, "hud");

    // Mount shell
    const ok = await loadHTMLIntoMount(HTML);

    // Then runtime (will watch if deps not ready yet)
    ensureJS(RUNTIME, "runtime");

    return !!ok;
  }

  function startWatchingForMount() {
    if (mo) return;

    retryTimer = setInterval(async () => {
      const ok = await tryBootOnce();
      if (ok) stopWatching();
    }, 700);

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
    try {
      const ok = await tryBootOnce();
      if (!ok) startWatchingForMount();
    } catch (e) {
      console.warn("HUD loader error:", e);
      startWatchingForMount();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
