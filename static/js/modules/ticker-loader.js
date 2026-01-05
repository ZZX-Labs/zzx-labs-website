// /static/js/modules/ticker-loader.js
// ZZX Bitcoin HUD + Widget Orchestrator (AUTHORITATIVE)
//
// This is the ONLY file allowed to:
// - boot the HUD runtime
// - mount bitcoin-ticker
// - mount the remaining widgets
//
// It is:
// - prefix-safe
// - idempotent
// - ordered
// - partials-aware
//
// Legacy loaders must DEFER to this file.

(function () {
  "use strict";

  const W = window;
  const D = document;

  // ---------------------------------------------------------------------------
  // Hard stop: never boot twice
  // ---------------------------------------------------------------------------

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ---------------------------------------------------------------------------
  // Prefix resolution (single source)
  // ---------------------------------------------------------------------------

  function getPrefix() {
    // Highest priority: explicit runtime prefix
    if (typeof W.ZZX?.PREFIX === "string" && W.ZZX.PREFIX.length) {
      return W.ZZX.PREFIX;
    }

    // HTML-level override (GH Pages subpaths)
    const htmlPrefix = document.documentElement.getAttribute("data-zzx-prefix");
    if (htmlPrefix) return htmlPrefix;

    // Fallback: root
    return "";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    if (!prefix) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  const PREFIX = getPrefix();

  // ---------------------------------------------------------------------------
  // Asset paths (ABSOLUTE, PREFIX-AWARE)
  // ---------------------------------------------------------------------------

  const RUNTIME_JS = join(PREFIX, "/__partials/widgets/runtime.js");
  const WIDGET_HTML = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const WIDGET_CSS  = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");

  // runtime subwidgets (order matters)
  const SUBWIDGETS = [
    "/__partials/widgets/bitcoin-ticker/widget.js",

    "/__partials/widgets/price-24h/widget.js",
    "/__partials/widgets/volume-24h/widget.js",

    "/__partials/widgets/hashrate/widget.js",
    "/__partials/widgets/hashrate-by-nation/widget.js",

    "/__partials/widgets/nodes/widget.js",
    "/__partials/widgets/nodes-by-nation/widget.js",

    "/__partials/widgets/lightning/widget.js",
    "/__partials/widgets/lightning-detail/widget.js",

    "/__partials/widgets/mempool/widget.js",
    "/__partials/widgets/fees/widget.js",
    "/__partials/widgets/mempool-goggles/widget.js",

    "/__partials/widgets/tip/widget.js",
    "/__partials/widgets/drift/widget.js",

    "/__partials/widgets/btc-intel/widget.js",
    "/__partials/widgets/btc-news/widget.js",
    "/__partials/widgets/satoshi-quote/widget.js",

    "/__partials/widgets/btc-halving-suite/widget.js",

    "/__partials/widgets/btc-mined/widget.js",
    "/__partials/widgets/btc-to-mine/widget.js",

    "/__partials/widgets/btc-blockexplorer/widget.js",
    "/__partials/widgets/btc-notabletxs/widget.js",

    // LAST widget: single full-width
    "/__partials/widgets/bitrng/widget.js",
  ].map(p => join(PREFIX, p));

  // ---------------------------------------------------------------------------
  // Load helpers (idempotent)
  // ---------------------------------------------------------------------------

  function loadCSSOnce(href) {
    if (document.querySelector(`link[data-zzx-css="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.zzxCss = href;
    document.head.appendChild(l);
  }

  function loadJSOnce(src) {
    return new Promise((resolve) => {
      if (document.querySelector(`script[data-zzx-js="${src}"]`)) {
        return resolve(true);
      }
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.dataset.zzxJs = src;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false); // non-fatal
      document.head.appendChild(s);
    });
  }

  async function fetchHTML(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTML fetch failed ${r.status}: ${url}`);
    return await r.text();
  }

  // ---------------------------------------------------------------------------
  // Wait for partials-loader (ABSOLUTE REQUIREMENT)
  // ---------------------------------------------------------------------------

  function waitForPartials() {
    if (W.__zzx_partials_ready) return Promise.resolve(true);

    return new Promise((resolve) => {
      const done = () => resolve(true);
      D.addEventListener("zzx:partials:ready", done, { once: true });

      // Hard fallback after DOM ready
      if (D.readyState === "complete" || D.readyState === "interactive") {
        setTimeout(done, 400);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT SEQUENCE (STRICT ORDER)
  // ---------------------------------------------------------------------------

  (async function boot() {
    try {
      await waitForPartials();

      const mount = D.getElementById("ticker-container");
      if (!mount) return;

      // 1) CSS first
      loadCSSOnce(WIDGET_CSS);

      // 2) Inject wrapper HTML
      const html = await fetchHTML(WIDGET_HTML);
      mount.innerHTML = html;

      // 3) Runtime (HUD state, buttons, registry)
      await loadJSOnce(RUNTIME_JS);

      // 4) Subwidgets (deterministic order)
      for (const src of SUBWIDGETS) {
        await loadJSOnce(src);
      }

      // 5) Start widget registry (safe if already started)
      W.__ZZX_WIDGETS?.start?.();

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    }
  })();
})();
