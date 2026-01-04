(function () {
  if (window.__ZZX_RUNTIME_WIDGET_BOUND) return;
  window.__ZZX_RUNTIME_WIDGET_BOUND = true;

  function $(sel, root = document){ return root.querySelector(sel); }

  function bind() {
    const card = $("[data-runtime-card]");
    if (!card) return;

    const status = $("[data-runtime-status]", card);

    function refresh() {
      const m = window.ZZXHudState?.getMode?.() || document.documentElement.dataset.zzxHud || "full";
      if (status) status.textContent = `mode: ${m}`;
    }

    card.querySelectorAll("[data-zzx-mode]").forEach(btn => {
      if (btn.__bound) return;
      btn.__bound = true;
      btn.addEventListener("click", () => {
        window.ZZXHudState?.setMode?.(btn.dataset.zzxMode);
        refresh();
      });
    });

    const reset = card.querySelector('[data-zzx-action="reset"]');
    if (reset && !reset.__bound) {
      reset.__bound = true;
      reset.addEventListener("click", () => {
        try { localStorage.removeItem("zzx.hud.mode"); } catch (_) {}
        window.ZZXHudState?.setMode?.("full");
        refresh();
      });
    }

    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
