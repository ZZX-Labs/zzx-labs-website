// __partials/bitcoin-ticker-widget.js
// DROP-IN REPLACEMENT
//
// Purpose (and ONLY purpose):
// - Ensure the HUD boots via /static/js/modules/ticker-loader.js (prefix-aware)
// - Ensure the ticker NEVER renders “raw/unstyled” by FORCE-injecting required CSS primitives
// - Do NOT load runtime.js directly
//
// NOTES (critical fixes, no new architecture):
// - NORMALIZE PREFIX: never allow "." or "./" (those create ./__partials/... 404s in Core)
// - KEEP CSS injection first (prevents “raw ticker” flashes)
// - KEEP idempotency
//
// FIX (your instability case):
// - Ensure ticker-loader boots even if partials events never fire
// - Still safe/idempotent if it *does* fire later

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
    // Prefer already-established prefix
    let p = W.ZZX?.PREFIX;
    if (typeof p === "string") p = p.trim();

    // Fall back to html attribute if needed
    if (!p) {
      const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
      if (typeof htmlPrefix === "string") p = htmlPrefix.trim();
    }

    // CRITICAL: never allow "." or "./" (it generates ./__partials/... paths)
    if (p === "." || p === "./") p = "";

    // Remove trailing slashes
    p = String(p || "").replace(/\/+$/g, "");

    // Persist normalized prefix so everyone agrees
    W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX: p });

    return p;
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    // absolute URL
    if (/^https?:\/\//i.test(s)) return s;

    // must be absolute-path to be prefix-joined
    if (!s.startsWith("/")) return s;

    const p = String(prefix || "").replace(/\/+$/, "");
    if (!p || p === "." || p === "/") return s;

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

    // Optional: ticker widget styling itself
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
    (D.head || D.documentElement).appendChild(s);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    // 1) CSS first — prevents “raw ticker”
    ensurePrimitivesCSS();

    // 2) Orchestrator
    ensureTickerLoader();
  }

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    boot();
  }

  // Always boot on DOM readiness (covers pages where partials events never fire)
  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", finish, { once: true });
  } else {
    finish();
  }

  // Also boot when partials-ready fires (covers pages that inject header/footer after)
  W.addEventListener("zzx:partials-ready", finish, { once: true });
  W.addEventListener("zzx:partials:ready", finish, { once: true });

  // If prefix already known, normalize immediately (prevents "." / "./" bugs)
  if (W.ZZX && typeof W.ZZX.PREFIX === "string") {
    getPrefix();
  }
})();
