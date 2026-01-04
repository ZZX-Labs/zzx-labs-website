/* __partials/widgets/runtime/widget.js */
/* DROP-IN REPLACEMENT */

(function () {
  const Core = window.ZZXWidgetsCore;
  const HUD  = window.ZZXHUD;

  // Allow Core-less fallback so the controls don't silently die.
  const qs = (sel, scope) => (Core?.qs ? Core.qs(sel, scope) : (scope || document).querySelector(sel));

  if (!HUD) return;

  function applyModeToDOM(mode) {
    const hudRoot = qs('[data-hud-root]');
    const handle  = qs('[data-hud-handle]');

    if (hudRoot) hudRoot.setAttribute("data-hud-state", mode);

    // Handle is ALWAYS present; show it only when HUD hidden
    if (handle) handle.style.display = (mode === "hidden") ? "flex" : "none";

    const label = qs('[data-runtime-mode]');
    if (label) label.textContent = mode;
  }

  function setMode(mode) {
    // Prefer the HUD API if present (your hud-state.js defines read/write/reset/normalize)
    if (typeof HUD.write === "function") {
      const s = HUD.write(mode);
      applyModeToDOM(s.mode);
      return s.mode;
    }

    // Fallback: localStorage + DOM
    try { localStorage.setItem("zzx.hud.mode", mode); } catch (_) {}
    applyModeToDOM(mode);
    return mode;
  }

  function reset() {
    if (typeof HUD.reset === "function") {
      const s = HUD.reset();
      // After reset, ensure DOM matches the reset mode
      applyModeToDOM(s.mode);
      return s.mode;
    }
    try { localStorage.removeItem("zzx.hud.mode"); } catch (_) {}
    applyModeToDOM("full");
    return "full";
  }

  function syncLabel() {
    if (typeof HUD.read === "function") {
      const s = HUD.read();
      applyModeToDOM(s.mode);
      return;
    }
    // fallback read
    let m = "full";
    try {
      const v = localStorage.getItem("zzx.hud.mode");
      if (v === "full" || v === "ticker-only" || v === "hidden") m = v;
    } catch (_) {}
    applyModeToDOM(m);
  }

  function bind() {
    const root = qs('[data-widget-root="runtime"]');
    if (!root || root.__bound) return;
    root.__bound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) setMode(mode);

      if (action === "reset") {
        reset();
        // If your runtime exposes a rebind hook, call it (non-fatal if absent)
        try { window.ZZXWidgetsRuntime?.rebind?.(true); } catch (_) {}
        try { window.__ZZX_WIDGETS_RUNTIME?.rebind?.(true); } catch (_) {}
      }
    });

    // initial sync
    syncLabel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
