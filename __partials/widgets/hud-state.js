/* __partials/widgets/hud-state.js
   Persists HUD mode and guarantees a recover path.
   Modes: "full" | "ticker-only" | "hidden"
*/
(function () {
  const W = window;
  if (W.ZZXHUD) return;

  const KEY = "zzx.hud.mode.v1";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function readMode() {
    try {
      const v = localStorage.getItem(KEY) || "full";
      return VALID.has(v) ? v : "full";
    } catch (_) {
      return "full";
    }
  }

  function writeMode(mode) {
    const m = VALID.has(mode) ? mode : "full";
    try { localStorage.setItem(KEY, m); } catch (_) {}
    return m;
  }

  function apply(mode) {
    const hudRoot = document.querySelector("[data-hud-root]");
    const handle  = document.querySelector("[data-hud-handle]");
    if (hudRoot) hudRoot.setAttribute("data-hud-state", mode);

    // handle should appear only when hidden
    if (handle) handle.hidden = (mode !== "hidden");
  }

  function setMode(mode) {
    const m = writeMode(mode);
    apply(m);
    return { mode: m };
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (_) {}
    const m = "full";
    apply(m);
    return { mode: m };
  }

  function read() {
    const m = readMode();
    apply(m);
    return { mode: m };
  }

  // boot apply immediately
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => read(), { once: true });
  } else {
    read();
  }

  W.ZZXHUD = { read, setMode, reset };
})();
