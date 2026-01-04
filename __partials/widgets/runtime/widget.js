// __partials/widgets/runtime/widget.js
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core || !window.ZZXHUD) return;

  function applyModeToDOM(mode) {
    const hudRoot = Core.qs('[data-hud-root]');
    const handle = Core.qs('[data-hud-handle]');

    if (hudRoot) hudRoot.setAttribute("data-mode", mode);

    // Handle is ALWAYS present. Only show the button when HUD is hidden.
    if (handle) {
      handle.hidden = (mode !== "hidden");
    }

    // Also update runtime label if present
    const label = Core.qs('[data-runtime-mode]');
    if (label) label.textContent = mode;
  }

  function bindRuntimeControls() {
    const root = Core.qs('[data-widget-root="runtime"]');
    if (!root || root.__bound) return;
    root.__bound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) {
        const s = window.ZZXHUD.setMode(mode);
        applyModeToDOM(s.mode);
      }

      if (action === "reset") {
        const s = window.ZZXHUD.reset();
        applyModeToDOM(s.mode);
        // optional: trigger re-mount/reload
        if (window.ZZXWidgetsRuntime?.rebind) window.ZZXWidgetsRuntime.rebind(true);
      }
    });
  }

  function bindHudHandle() {
    const showBtn = Core.qs('[data-hud-show]');
    if (!showBtn || showBtn.__bound) return;
    showBtn.__bound = true;
    showBtn.addEventListener("click", () => {
      const s = window.ZZXHUD.setMode("full");
      applyModeToDOM(s.mode);
    });
  }

  function boot() {
    const s = window.ZZXHUD.read();
    applyModeToDOM(s.mode);
    bindRuntimeControls();
    bindHudHandle();
  }

  // Re-run safely if fragment reinjected
  if (window.__ZZX_RUNTIME_WIDGET_BOOTED) {
    boot();
    return;
  }
  window.__ZZX_RUNTIME_WIDGET_BOOTED = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
