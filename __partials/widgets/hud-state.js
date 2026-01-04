// __partials/widgets/hud-state.js
// Persists HUD mode + guarantees recovery button visibility

(function () {
  if (window.ZZXHUD) return;

  const KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function readMode() {
    const v = String(localStorage.getItem(KEY) || "full");
    return VALID.has(v) ? v : "full";
  }

  function writeMode(mode) {
    const m = VALID.has(mode) ? mode : "full";
    localStorage.setItem(KEY, m);
    return m;
  }

  function reset() {
    localStorage.removeItem(KEY);
    return "full";
  }

  window.ZZXHUD = {
    read() { return { mode: readMode() }; },
    setMode(mode) { return { mode: writeMode(mode) }; },
    reset() { return { mode: reset() }; },
  };
})();
