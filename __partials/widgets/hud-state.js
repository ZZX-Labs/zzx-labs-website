// __partials/widgets/hud-state.js
// Single source of truth for HUD mode. Default = "full".
// Persists in localStorage.

(function () {
  const KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function normalize(mode) {
    if (!mode) return "full";
    mode = String(mode).trim();
    return VALID.has(mode) ? mode : "full";
  }

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return { mode: normalize(v) };
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

  window.ZZXHUD = { read, write, reset, normalize };
})();
