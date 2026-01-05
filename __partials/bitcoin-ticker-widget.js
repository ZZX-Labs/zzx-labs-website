// __partials/bitcoin-ticker-widget.js
// DROP-IN REPLACEMENT
//
// Purpose (and ONLY purpose):
// - Ensure the HUD boots via /static/js/modules/ticker-loader.js (prefix-aware)
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
    if (!p || p === ".") return s;     // root-hosted
    if (p === "/") return s;

    return p + s;
  }

  function ensureTickerLoader() {
    // ticker-loader.js is the single source of truth now
    if (D.querySelector('script[data-zzx-ticker-loader="1"]')) return;

    const src = join(getPrefix(), "/static/js/modules/ticker-loader.js");

    const s = D.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-ticker-loader", "1");
    // head is slightly safer than body for early boot on some pages
    (D.head || D.documentElement).appendChild(s);
  }

  // If prefix already known, inject immediately.
  if (W.ZZX && typeof W.ZZX.PREFIX === "string") {
    ensureTickerLoader();
    return;
  }

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    ensureTickerLoader();
  }

  // Listen for either partials-ready event name (you used both historically)
  W.addEventListener("zzx:partials-ready", finish, { once: true });
  W.addEventListener("zzx:partials:ready", finish, { once: true });

  // Fallback: inject after DOM ready even if event never fires
  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", finish, { once: true });
  } else {
    finish();
  }
})();
