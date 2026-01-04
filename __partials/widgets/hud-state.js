// __partials/widgets/hud-state.js
// Single source of truth for HUD state persistence.

(function () {
  const KEY = "zzx.hud.state.v1";

  const DEFAULTS = {
    mode: "full",            // "full" | "ticker-only" | "hidden"
    order: null,             // optional array of widget ids
    enabled: null,           // optional map id->bool
  };

  function readRaw() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return null;
      const obj = JSON.parse(s);
      return (obj && typeof obj === "object") ? obj : null;
    } catch {
      return null;
    }
  }

  function writeRaw(obj) {
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
  }

  function read() {
    const obj = readRaw() || {};
    const mode = (obj.mode === "full" || obj.mode === "ticker-only" || obj.mode === "hidden")
      ? obj.mode
      : DEFAULTS.mode;

    return {
      mode,
      order: Array.isArray(obj.order) ? obj.order.slice() : null,
      enabled: (obj.enabled && typeof obj.enabled === "object") ? { ...obj.enabled } : null
    };
  }

  function setMode(mode) {
    const s = read();
    const next = {
      ...s,
      mode: (mode === "full" || mode === "ticker-only" || mode === "hidden") ? mode : s.mode
    };
    writeRaw(next);
    return next;
  }

  function reset() {
    writeRaw({ ...DEFAULTS });
    return read();
  }

  // Expose
  window.ZZXHUD = { read, setMode, reset };
})();
