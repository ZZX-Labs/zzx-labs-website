// /static/js/modules/ticker-loader.js
// Loads the sitewide ticker widget (HTML fragment + CSS + JS) once per page.
// CONTRACT:
// - Pages contain: <div id="ticker-container"><div id="btc-ticker"></div></div>
// - We inject HTML into #btc-ticker ONLY (never overwrite #ticker-container)

(function () {
  const HTML_PATH = "/__partials/bitcoin-ticker-widget.html";
  const CSS_PATH  = "/__partials/bitcoin-ticker-widget.css";
  const JS_PATH   = "/__partials/bitcoin-ticker-widget.js";

  function ensureStylesheetOnce() {
    if (document.querySelector('link[data-zzx-ticker-css="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_PATH;
    link.setAttribute("data-zzx-ticker-css", "1");
    document.head.appendChild(link);
  }

  function ensureScriptOnce() {
    if (document.querySelector('script[data-zzx-ticker-js="1"]')) return;
    const s = document.createElement("script");
    s.src = JS_PATH;
    s.defer = true;
    s.setAttribute("data-zzx-ticker-js", "1");
    document.body.appendChild(s);
  }

  async function loadFragment() {
    const r = await fetch(HTML_PATH, { cache: "no-store" });
    if (!r.ok) throw new Error(`ticker widget HTML HTTP ${r.status}`);
    return await r.text();
  }

  async function boot() {
    const container = document.getElementById("ticker-container");
    if (!container) return;

    // Your pages have this mount (see index.html) :contentReference[oaicite:4]{index=4}
    let mount = document.getElementById("btc-ticker");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "btc-ticker";
      container.appendChild(mount);
    }

    // Duplicate guard (covers partial reinjection too)
    if (container.dataset.tickerLoaded === "1") return;
    container.dataset.tickerLoaded = "1";

    ensureStylesheetOnce();

    try {
      const html = await loadFragment();
      mount.innerHTML = html;
      ensureScriptOnce();
    } catch (e) {
      console.warn("[ticker-loader] failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
