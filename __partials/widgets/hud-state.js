// __partials/widgets/hud-state.js
(function () {
  if (window.ZZXHudState) return;

  const STORAGE_KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function getHudRoot() {
    return document.querySelector(".zzx-widgets[data-zzx-widgets='1']");
  }
  function getHandle() {
    return document.querySelector("[data-hud-handle]");
  }

  function setMode(mode) {
    const m = VALID.has(mode) ? mode : "full";

    // 1) set on <html> for global CSS hooks
    document.documentElement.dataset.zzxHud = m;

    // 2) set on hud container for scoped rules
    const hud = getHudRoot();
    if (hud) hud.dataset.mode = m;

    // 3) persist
    try { localStorage.setItem(STORAGE_KEY, m); } catch (_) {}

    // 4) handle visibility (Option A)
    const handle = getHandle();
    if (handle) handle.style.display = (m === "hidden") ? "flex" : "none";
  }

  function getMode() {
    const dom = document.documentElement.dataset.zzxHud;
    if (VALID.has(dom)) return dom;
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (VALID.has(ls)) return ls;
    } catch (_) {}
    return "full";
  }

  function bindButtonsOnce() {
    const hud = getHudRoot();
    if (hud && !hud.__zzxBound) {
      hud.__zzxBound = true;

      hud.querySelectorAll("[data-zzx-mode]").forEach(btn => {
        btn.addEventListener("click", () => setMode(btn.dataset.zzxMode));
      });

      const reset = hud.querySelector('[data-zzx-action="reset"]');
      if (reset) {
        reset.addEventListener("click", () => {
          try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
          setMode("full");
        });
      }
    }

    // Always bind handle show button (Option A)
    const show = document.querySelector("[data-hud-show]");
    if (show && !show.__zzxBound) {
      show.__zzxBound = true;
      show.addEventListener("click", () => setMode("full"));
    }
  }

  function boot(defaultMode = "full") {
    bindButtonsOnce();
    const m = getMode() || defaultMode;
    setMode(m);
  }

  window.ZZXHudState = { boot, setMode, getMode };
})();
