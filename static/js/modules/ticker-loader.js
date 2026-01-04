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
      // core styling for all widgets + shell layout
      CSS_HREF: join(prefix, "/__partials/widgets/_core/widget-core.css"),
      // shell that contains rail + controls + mount point
      HTML_HREF: join(prefix, "/__partials/widgets/runtime.html"),
      // runtime that loads manifest + widgets
      JS_SRC:   join(prefix, "/__partials/widgets/runtime.js"),
    };
  }

  function ensureCSS(CSS_HREF) {
    if (document.querySelector('link[data-zzx-btc-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = CSS_HREF;
    l.setAttribute("data-zzx-btc-css", "1");
    document.head.appendChild(l);
  }

  function ensureJS(JS_SRC) {
    if (document.querySelector('script[data-zzx-btc-js="1"]')) return;
    const s = document.createElement("script");
    s.src = JS_SRC;
    s.defer = true;
    s.setAttribute("data-zzx-btc-js", "1");
    document.body.appendChild(s);
  }

  async function loadHTMLIntoMount(HTML_HREF, JS_SRC) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) {
      ensureJS(JS_SRC);
      return true;
    }

    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(HTML_HREF, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime shell html HTTP ${r.status}`);
      const html = await r.text();
      mount.innerHTML = html;
      container.dataset.tickerLoaded = "1";
      ensureJS(JS_SRC);
      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  let mo = null;
  let retryTimer = null;

  async function tryBootOnce() {
    const { CSS_HREF, HTML_HREF, JS_SRC } = hrefs();
    ensureCSS(CSS_HREF);

    try {
      const ok = await loadHTMLIntoMount(HTML_HREF, JS_SRC);
      return !!ok;
    } catch (e) {
      console.warn("Ticker loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
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
