// static/js/modules/ticker-loader.js
// Single source of truth for the global BTC widget rail.
// - no page edits required
// - waits for partials injection (mount appears later)
// - prefix-aware (works from any depth / GH Pages / subpaths)
// - injects widget CSS once, widget JS once
// - mounts HTML into #btc-ticker only (never overwrites #ticker-container)

(function () {
  const W = window;

  // Prevent double-boot across reinjections
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // -------- prefix-aware URL builder --------
  // partials-loader sets: window.ZZX = { PREFIX: '.' | '..' | ... | '/' }
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    // If not ready yet, fall back to '.' (relative)
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    // path like "/__partials/..." or "/static/..."
    if (!path) return path;
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path; // already relative
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

  // -------- one-time injectors --------
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

  // -------- mount logic --------
  async function loadHTMLIntoMount(HTML_HREF, JS_SRC) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // If already mounted, just ensure JS exists and return.
    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) {
      ensureJS(JS_SRC);
      return true;
    }

    // Prevent overlapping loads
    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(HTML_HREF, { cache: "no-store" });
      if (!r.ok) throw new Error(`widget html HTTP ${r.status}`);
      const html = await r.text();

      // IMPORTANT: mount only. Do NOT touch container.innerHTML.
      mount.innerHTML = html;

      // Mark success ONLY after mount is in DOM
      container.dataset.tickerLoaded = "1";

      // Ensure widget JS is present (it self-primes once mounted)
      ensureJS(JS_SRC);

      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  // -------- boot + retry strategy --------
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
      // allow retry
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
      return false;
    }
  }

  function startWatchingForMount() {
    if (mo) return;

    // Retry a few times even without DOM mutations (slow networks)
    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        const ok = await tryBootOnce();
        if (ok) stopWatching();
      }, 700);
    }

    // Also observe DOM changes (partials-loader injection)
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
    // If prefix isn’t ready yet, we still try; observer will catch later.
    const ok = await tryBootOnce();
    if (!ok) startWatchingForMount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
