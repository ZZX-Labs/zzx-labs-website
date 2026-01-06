// __partials/bitcoin-ticker-widget.js
// DROP-IN REPLACEMENT
//
// Purpose (and ONLY purpose):
// - Ensure the HUD boots via /static/js/modules/ticker-loader.js (prefix-aware)
// - Ensure the ticker NEVER renders “raw/unstyled” by FORCE-injecting required CSS primitives
// - Do NOT load runtime.js directly (prevents duplicate orchestrators / bad order)
//
// This is a compatibility shim for legacy pages that still include
// "/__partials/bitcoin-ticker-widget.js". The authoritative orchestrator is:
// "/static/js/modules/ticker-loader.js"

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Prevent duplicate injection across reinjections / partial reloads
  if (W.__ZZX_PARTIAL_TICKER_SHIM_BOOTED) return;
  W.__ZZX_PARTIAL_TICKER_SHIM_BOOTED = true;

  // ----------------------------
  // Versioning (optional)
  // ----------------------------
  function assetVersion() {
    const el = D.querySelector('meta[name="asset-version"]');
    const v = el ? (el.getAttribute("content") || "").trim() : "";
    return v;
  }

  function withV(href) {
    const v = assetVersion();
    if (!v) return href;
    try {
      const u = new URL(href, location.href);
      if (!u.searchParams.has("v")) u.searchParams.set("v", v);
      return u.href;
    } catch (_) {
      return href;
    }
  }

  // ----------------------------
  // Prefix + join (NO ../ ever)
  // ----------------------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    // Hosted at root => "" is fine; "." also works with your join() rules, but "" is cleaner.
    if (typeof p === "string") return p;
    const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof htmlPrefix === "string" && htmlPrefix.length) return htmlPrefix;
    return "";
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    // absolute URL
    if (/^https?:\/\//i.test(s)) return s;

    // must be absolute-path to be prefix-joined
    if (!s.startsWith("/")) return s;

    const p = String(prefix || "").replace(/\/+$/, "");
    if (!p || p === ".") return s; // root-hosted
    if (p === "/") return s;

    return p + s;
  }

  // ----------------------------
  // Idempotent CSS loader (critical to prevent raw ticker)
  // ----------------------------
  function cssKey(href) {
    try {
      return btoa(unescape(encodeURIComponent(href))).replace(/=+$/g, "");
    } catch (_) {
      return String(href).replace(/[^a-z0-9_-]/gi, "_");
    }
  }

  function ensureCSSOnce(href) {
    const h = withV(href);
    const key = "zzxcss:" + cssKey(h);
    if (D.querySelector(`link[data-zzx-css="${key}"]`)) return;

    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = h;
    l.setAttribute("data-zzx-css", key);
    (D.head || D.documentElement).appendChild(l);
  }

  function ensurePrimitivesCSS() {
    const prefix = getPrefix();

    // REQUIRED primitives (btc-card, btc-rail, ticker-only rules, handle rules)
    const wrapperCSS = join(prefix, "/__partials/bitcoin-ticker-widget.css");

    // Optional (but usually present): ticker widget styling itself
    const tickerCSS = join(prefix, "/__partials/widgets/bitcoin-ticker/widget.css");

    ensureCSSOnce(wrapperCSS);
    ensureCSSOnce(tickerCSS);
  }

  // ----------------------------
  // Idempotent JS loader for ticker-loader
  // ----------------------------
  function ensureTickerLoader() {
    // ticker-loader.js is the single source of truth now
    if (D.querySelector('script[data-zzx-ticker-loader="1"]')) return;

    const src = withV(join(getPrefix(), "/static/js/modules/ticker-loader.js"));

    const s = D.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-ticker-loader", "1");
    // head is slightly safer than body for early boot on some pages
    (D.head || D.documentElement).appendChild(s);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    // 1) CSS first — this is what fixes “raw ticker” even when JS/data is correct
    ensurePrimitivesCSS();

    // 2) Orchestrator
    ensureTickerLoader();
  }

  // If prefix already known, boot immediately.
  if (W.ZZX && typeof W.ZZX.PREFIX === "string") {
    boot();
    return;
  }

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    boot();
  }

  // Listen for either partials-ready event name (you used both historically)
  W.addEventListener("zzx:partials-ready", finish, { once: true });
  W.addEventListener("zzx:partials:ready", finish, { once: true });

  // Fallback: boot after DOM ready even if event never fires
  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", finish, { once: true });
  } else {
    finish();
  }
})();
