/* __partials/widgets/runtime/widget.js */
/* DROP-IN REPLACEMENT (final hardened) */

(function () {
  const HUD = window.ZZXHUD;

  // If HUD isn't present, don't crash the page.
  if (!HUD) return;

  const qs = (sel, scope) => (scope || document).querySelector(sel);

  function normalizeMode(mode) {
    if (typeof HUD.normalize === "function") return HUD.normalize(mode).mode;
    // fallback normalize
    return (mode === "full" || mode === "ticker-only" || mode === "hidden") ? mode : "full";
  }

  function applyModeToDOM(mode) {
    const m = normalizeMode(mode);

    // hudRoot is the wrapper that gets data-hud-state
    const hudRoot = qs('[data-hud-root]');
    if (hudRoot) hudRoot.setAttribute("data-hud-state", m);

    // handle is ALWAYS present; show it only when HUD hidden
    const handle = qs('[data-hud-handle]');
    if (handle) handle.style.display = (m === "hidden") ? "flex" : "none";

    // runtime label (optional)
    const label = qs('[data-runtime-mode]');
    if (label) label.textContent = m;

    return m;
  }

  function setMode(mode) {
    // Prefer HUD.write if it exists
    if (typeof HUD.write === "function") {
      const s = HUD.write(mode);
      return applyModeToDOM(s?.mode || mode);
    }

    // Fallback: localStorage + DOM
    const m = normalizeMode(mode);
    try { localStorage.setItem("zzx.hud.mode", m); } catch (_) {}
    return applyModeToDOM(m);
  }

  function reset() {
    if (typeof HUD.reset === "function") {
      const s = HUD.reset();
      return applyModeToDOM(s?.mode || "full");
    }

    try { localStorage.removeItem("zzx.hud.mode"); } catch (_) {}
    return applyModeToDOM("full");
  }

  function syncFromState() {
    if (typeof HUD.read === "function") {
      const s = HUD.read();
      applyModeToDOM(s?.mode || "full");
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
    // NOTE: runtime widget root should be inside runtime/widget.html
    const root =
      qs('[data-widget-root="runtime"]') ||
      qs('[data-widget-id="runtime"]') ||
      qs('[data-widget-slot="runtime"]');

    if (!root || root.__zzxBoundRuntimeControls) return;
    root.__zzxBoundRuntimeControls = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) setMode(mode);

      if (action === "reset") {
        reset();

        // Optional: if you ever implement a runtime rebind hook, call it safely.
        try { window.ZZXWidgetsRuntime?.rebind?.(true); } catch (_) {}
        try { window.__ZZX_WIDGETS_RUNTIME?.rebind?.(true); } catch (_) {}
      }
    });

    syncFromState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
