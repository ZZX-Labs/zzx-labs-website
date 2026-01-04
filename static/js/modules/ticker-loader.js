// static/js/modules/ticker-loader.js
// ROLLBACK: mounts the classic single-file widget rail again.
// - prefix-aware
// - injects /__partials/bitcoin-ticker-widget.css once
// - mounts /__partials/bitcoin-ticker-widget.html into #btc-ticker only
// - loads /__partials/bitcoin-ticker-widget.js once

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
    if (prefix === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function hrefs() {
    const prefix = getPrefix();
    return {
      CSS_HREF: join(prefix, "/__partials/bitcoin-ticker-widget.css"),
      HTML_HREF: join(prefix, "/__partials/bitcoin-ticker-widget.html"),
      JS_SRC:   join(prefix, "/__partials/bitcoin-ticker-widget.js"),
    };
  }

  function ensureCSS(href) {
    if (document.querySelector('link[data-zzx-btc-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-btc-css", "1");
    document.head.appendChild(l);
  }

  function ensureJS(src) {
    if (document.querySelector('script[data-zzx-btc-js="1"]')) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-btc-js", "1");
    document.body.appendChild(s);
  }

  async function mountHTML(htmlHref, jsSrc) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) {
      ensureJS(jsSrc);
      return true;
    }

    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(htmlHref, { cache: "no-store" });
      if (!r.ok) throw new Error(`widget html HTTP ${r.status}`);
      mount.innerHTML = await r.text();
      container.dataset.tickerLoaded = "1";
      ensureJS(jsSrc);
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
      return await mountHTML(HTML_HREF, JS_SRC);
    } catch (e) {
      console.warn("Ticker loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
      return false;
    }
  }

  function startWatching() {
    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      }, 700);
    }

    if (!mo) {
      mo = new MutationObserver(async () => {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function stopWatching() {
    if (mo) { mo.disconnect(); mo = null; }
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }

  async function boot() {
    const ok = await tryBootOnce();
    if (!ok) startWatching();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
