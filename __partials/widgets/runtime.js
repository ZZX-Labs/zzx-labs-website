// __partials/widgets/runtime.js
// Minimal widget registry + mount + ticking.
// No modules needed. Safe to include once site-wide.

(function () {
  if (window.__ZZX_WIDGETS) return;

  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX-WIDGET]", ...a);

  const registry = [];
  const state = {
    started: false,
    timers: [],
    mounts: new WeakMap(), // rootEl -> { widgets: Set<string> }
  };

  function mounted(root) {
    return !!root && root.isConnected;
  }

  function scanAndBind() {
    // Convention: each widget root has [data-zzx-widget="name"]
    const roots = document.querySelectorAll("[data-zzx-widget]");
    roots.forEach((root) => {
      const name = root.getAttribute("data-zzx-widget");
      if (!name) return;

      const m = state.mounts.get(root) || { widgets: new Set() };
      state.mounts.set(root, m);
      if (m.widgets.has(name)) return;

      const w = registry.find(x => x.name === name);
      if (!w) return;

      try {
        w.bind?.(root);
        m.widgets.add(name);
        log("bound", name);
      } catch (e) {
        console.warn("[ZZX-WIDGET] bind failed", name, e);
      }
    });
  }

  function tickAll() {
    scanAndBind();
    registry.forEach((w) => {
      try {
        // Each widget decides if it’s mounted by checking its own root(s)
        w.tick?.();
      } catch (e) {
        console.warn("[ZZX-WIDGET] tick failed", w.name, e);
      }
    });
  }

  window.__ZZX_WIDGETS = {
    register(widget) {
      if (!widget || !widget.name) throw new Error("widget must have name");
      if (registry.some(w => w.name === widget.name)) return;
      registry.push(widget);
      log("registered", widget.name);
      // bind immediately if already on DOM
      scanAndBind();
    },
    start() {
      if (state.started) return;
      state.started = true;
      scanAndBind();

      // fast tick for UI-responsiveness, but widgets internally throttle network
      state.timers.push(setInterval(tickAll, 800));
      // initial kick
      tickAll();
    }
  };

  // auto-start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.__ZZX_WIDGETS.start(), { once: true });
  } else {
    window.__ZZX_WIDGETS.start();
  }
})();
