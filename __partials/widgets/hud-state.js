// __partials/widgets/hud-state.js
(function () {
  const KEY = "zzx.hud.state.v1";

  const DEFAULT = {
    version: 1,
    mode: "full",            // "full" | "ticker-only" | "hidden"
    enabled: {},             // { [widgetId]: true/false } (optional overrides)
    order: [],               // optional future: array of widget ids
    sizes: {},               // optional future: { [widgetId]: {w,h} }
  };

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT };
      const obj = JSON.parse(raw);
      return { ...DEFAULT, ...(obj || {}) };
    } catch (_) {
      return { ...DEFAULT };
    }
  }

  function write(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function setMode(mode) {
    const s = read();
    s.mode = (mode === "hidden" || mode === "ticker-only" || mode === "full") ? mode : "full";
    write(s);
    return s;
  }

  function reset() {
    write({ ...DEFAULT });
    return read();
  }

  function isEnabled(id, manifestDefaultEnabled = true) {
    const s = read();
    if (Object.prototype.hasOwnProperty.call(s.enabled, id)) return !!s.enabled[id];
    return !!manifestDefaultEnabled;
  }

  window.ZZXHUD = Object.assign({}, window.ZZXHUD || {}, {
    KEY,
    read,
    write,
    setMode,
    reset,
    isEnabled,
  });
})();
