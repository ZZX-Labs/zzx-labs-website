// __partials/widgets/hud-state.js
(function () {
  const W = window;
  if (W.ZZXHUD) return;

  const KEY = "zzx.hud.mode.v1";

  function normalize(mode) {
    if (mode === "hidden" || mode === "ticker-only" || mode === "full") return mode;
    return "full";
  }

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return { mode: normalize(v || "full") };
    } catch (_) {
      return { mode: "full" };
    }
  }

  function write(mode) {
    mode = normalize(mode);
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    return { mode };
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (_) {}
    return { mode: "full" };
  }

  W.ZZXHUD = { read, write, reset };
})();
