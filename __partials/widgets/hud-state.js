// __partials/widgets/hud-state.js
// Single source of truth for HUD mode. Default = "full".
// Persists in localStorage.

(function () {
  "use strict";

  const KEY = "zzx.hud.mode";

  // Canonical states (match your runtime.html markup + CSS)
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function normalize(mode) {
    if (mode && typeof mode === "object" && "mode" in mode) mode = mode.mode; // accept {mode:"..."}
    if (!mode) return "full";

    let m = String(mode).trim().toLowerCase();

    // Back-compat: accept "ticker" and normalize to canonical "ticker-only"
    if (m === "ticker") m = "ticker-only";
    if (m === "ticker_only") m = "ticker-only";
    if (m === "tickeronly") m = "ticker-only";

    return VALID.has(m) ? m : "full";
  }

  function read() {
    try { return { mode: normalize(localStorage.getItem(KEY)) }; }
    catch (_) { return { mode: "full" }; }
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

  window.ZZXHUD = { read, write, reset, normalize };
})();
