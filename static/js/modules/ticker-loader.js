// static/js/modules/ticker-loader.js
// Single source of truth for the global BTC widget rail.
// - does NOT require changing any pages
// - loads __partials/bitcoin-ticker-widget.html into #btc-ticker
// - injects widget CSS into <head> once
// - loads widget JS once
// - never overwrites #ticker-container after mount

(function () {
  const W = window;

  // Prevent double-boot across reinjections
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  const CSS_HREF = "/__partials/bitcoin-ticker-widget.css";
  const HTML_HREF = "/__partials/bitcoin-ticker-widget.html";
  const JS_SRC = "/__partials/bitcoin-ticker-widget.js";

  function ensureCSS() {
    if (document.querySelector('link[data-zzx-btc-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = CSS_HREF;
    l.setAttribute("data-zzx-btc-css", "1");
    document.head.appendChild(l);
  }

  function ensureJS() {
    if (document.querySelector('script[data-zzx-btc-js="1"]')) return;
    const s = document.createElement("script");
    s.src = JS_SRC;
    s.defer = true;
    s.setAttribute("data-zzx-btc-js", "1");
    document.body.appendChild(s);
  }

  async function loadHTMLIntoMount() {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");

    if (!container || !mount) return;

    // Prevent duplicate loads on the same page
    if (container.dataset.tickerLoaded === "1") return;
    container.dataset.tickerLoaded = "1";

    // Fetch fragment
    const r = await fetch(HTML_HREF, { cache: "no-store" });
    if (!r.ok) throw new Error(`widget html HTTP ${r.status}`);
    const html = await r.text();

    // IMPORTANT: mount only. Do NOT touch container.innerHTML.
    mount.innerHTML = html;

    // Now ensure JS is present (it will wait until mounted if needed)
    ensureJS();
  }

  async function boot() {
    try {
      ensureCSS();
      await loadHTMLIntoMount();
    } catch (e) {
      console.warn("Ticker loader error:", e);
      // allow retry if needed
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
