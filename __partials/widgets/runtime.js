// __partials/widgets/runtime.js
(function () {
  const W = window;

  // prevent double boot
  if (W.__ZZX_WIDGET_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGET_RUNTIME_BOOTED = true;

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function applyMode(mode) {
    const hudRoot = qs("[data-hud-root]");
    const handle  = qs("[data-hud-handle]");
    const label   = qs("[data-hud-mode-label]");

    if (hudRoot) hudRoot.setAttribute("data-hud-state", mode);
    if (label) label.textContent = mode;

    // Show handle button only when hidden
    if (handle) {
      handle.style.display = (mode === "hidden") ? "block" : "none";
    }
  }

  function bindControls() {
    const bar = qs(".zzx-widgets__bar");
    const showBtn = qs("[data-hud-show]");

    if (bar && !bar.__bound) {
      bar.__bound = true;
      bar.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const mode = btn.getAttribute("data-hud-mode");
        const action = btn.getAttribute("data-hud-action");

        if (mode) {
          const s = W.ZZXHUD.write(mode);
          applyMode(s.mode);
        }

        if (action === "reset") {
          const s = W.ZZXHUD.reset();
          applyMode(s.mode);

          // force remount attempt
          const slots = qsa(".btc-slot[data-widget]");
          for (const slot of slots) {
            slot.dataset.mounted = "0";
            slot.dataset.mounting = "0";
          }
          mountAll(true);
        }
      });
    }

    if (showBtn && !showBtn.__bound) {
      showBtn.__bound = true;
      showBtn.addEventListener("click", () => {
        const s = W.ZZXHUD.write("full");
        applyMode(s.mode);
      });
    }
  }

  async function mountAll(force = false) {
    const Core = W.ZZXWidgetsCore;
    if (!Core) return 0;

    const root = qs("[data-hud-root]") || document;
    const slots = qsa(".btc-slot[data-widget]", root);

    if (force) {
      for (const slot of slots) {
        slot.dataset.mounted = "0";
        slot.innerHTML = "";
      }
    }

    // mount sequentially (keeps API bursts calmer)
    let ok = 0;
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      const did = await Core.mountWidget(id, slot);
      if (did) ok++;
    }
    return ok;
  }

  // If runtime is injected before core is ready, retry
  let mo = null;
  let retryTimer = null;

  function startWatch() {
    if (mo) return;

    retryTimer = setInterval(async () => {
      if (W.ZZXWidgetsCore && W.ZZXHUD) {
        const ok = await mountAll(false);
        if (ok) stopWatch();
      }
    }, 700);

    mo = new MutationObserver(async () => {
      if (W.ZZXWidgetsCore && W.ZZXHUD) {
        const ok = await mountAll(false);
        if (ok) stopWatch();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopWatch() {
    if (mo) { mo.disconnect(); mo = null; }
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }

  async function boot() {
    // Ensure state + controls
    const s = W.ZZXHUD.read();
    applyMode(s.mode);
    bindControls();

    // Try mount now; if no core yet, watch
    if (!W.ZZXWidgetsCore) {
      startWatch();
      return;
    }

    const ok = await mountAll(false);
    if (!ok) startWatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
