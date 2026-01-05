// __partials/widgets/hud-state.js
// SINGLE SOURCE OF TRUTH — DROP-IN REPLACEMENT
//
// Canonical HUD modes:
//   "full" | "ticker-only" | "hidden"
//
// Guarantees:
// - One global authority (window.ZZXHUD)
// - Backward-compatible aliases ("ticker", etc.)
// - Safe if loaded multiple times
// - Never throws
// - Never breaks existing callers
// - Persists state in localStorage
//
// NOTHING ELSE should define HUD state.

(function () {
  "use strict";

  const KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function normalize(mode) {
    // Accept { mode: "..." }
    if (mode && typeof mode === "object" && "mode" in mode) {
      mode = mode.mode;
    }

    if (!mode) return "full";

    let m = String(mode).trim().toLowerCase();

    // Back-compat aliases
    if (m === "ticker") m = "ticker-only";
    if (m === "ticker_only") m = "ticker-only";
    if (m === "tickeronly") m = "ticker-only";
    if (m === "visible") m = "full";

    return VALID.has(m) ? m : "full";
  }

  function read() {
    try {
      return { mode: normalize(localStorage.getItem(KEY)) };
    } catch (_) {
      return { mode: "full" };
    }
  }

  function write(mode) {
    const m = normalize(mode);
    try { localStorage.setItem(KEY, m); } catch (_) {}
    return { mode: m };
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (_) {}
    return { mode: "full" };
  }

  // Preserve any existing object but HARD-SET the contract
  const prev = window.ZZXHUD || {};

  window.ZZXHUD = {
    ...prev,
    read,
    write,
    reset,
    normalize,
  };
})();
