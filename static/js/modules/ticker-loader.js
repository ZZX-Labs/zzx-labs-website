// static/js/modules/ticker-loader.js
// Loads the Bitcoin HUD wrapper + runtime loader (prefix-aware, any depth).
// Single bar. No duplicate runtime bars. Widgets mount first, JS loads after.

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
      RUNTIME_HTML: join(prefix, "/__partials/widgets/runtime.html"),
      RUNTIME_JS: join(prefix, "/__partials/widgets/runtime.js"),
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

  function ensureJS(src) {
    if (document.querySelector('script[data-zzx-hud-js="1"]')) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-hud-js", "1");
    document.body.appendChild(s);
  }

  async function mountRuntimeShell(runtimeHtmlUrl) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    if (container.dataset.hudLoaded === "1" && mount.innerHTML.trim().length) {
      return true;
    }

    if (container.dataset.hudLoading === "1") return false;
    container.dataset.hudLoading = "1";

    try {
      const r = await fetch(runtimeHtmlUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime.html HTTP ${r.status}`);
      mount.innerHTML = await r.text();
      container.dataset.hudLoaded = "1";
      return true;
    } finally {
      container.dataset.hudLoading = "0";
    }
  }

  let mo = null;
  let retryTimer = null;

  async function tryBootOnce() {
    const { CORE_CSS, RUNTIME_HTML, RUNTIME_JS } = hrefs();
    ensureCSS(CORE_CSS);

    try {
      const ok = await mountRuntimeShell(RUNTIME_HTML);
      if (ok) ensureJS(RUNTIME_JS);
      return !!ok;
    } catch (e) {
      console.warn("HUD loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.hudLoaded = "0";
      return false;
    }
  }

  function startWatchingForMount() {
    if (mo) return;

    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      }, 700);
    }

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
