// __partials/widgets/hud-state.js
// Stores only mode. Always recoverable because handle button is outside hidden root.

(function () {
  const W = window;
  if (W.ZZXHUD) return;

  const KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function read() {
    const mode = String(localStorage.getItem(KEY) || "full");
    return { mode: VALID.has(mode) ? mode : "full" };
  }

  function write(mode) {
    const m = VALID.has(mode) ? mode : "full";
    localStorage.setItem(KEY, m);
    return { mode: m };
  }

  function setMode(mode) { return write(mode); }
  function reset() { localStorage.removeItem(KEY); return read(); }

  W.ZZXHUD = { read, setMode, reset };
})();
