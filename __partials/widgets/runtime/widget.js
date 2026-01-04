/* __partials/widgets/runtime/widget.js */
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core || !window.ZZXHUD) return;

  function syncLabel() {
    const s = window.ZZXHUD.read();
    const label = Core.qs('[data-runtime-mode]');
    if (label) label.textContent = s.mode;
  }

  function bind() {
    const root = Core.qs('[data-widget-root="runtime"]');
    if (!root || root.__bound) return;
    root.__bound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) {
        window.ZZXHUD.setMode(mode);
        syncLabel();
      }
      if (action === "reset") {
        window.ZZXHUD.reset();
        syncLabel();
        if (window.ZZXWidgetsRuntime?.rebind) window.ZZXWidgetsRuntime.rebind(true);
      }
    });

    syncLabel();
  }

  // safe boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
