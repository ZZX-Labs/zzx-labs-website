// __partials/widgets/hud-state.js
(function () {
  if (window.ZZXHudState) return;

  const STORAGE_KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function getRoot() { return document.querySelector("[data-hud-root]"); }
  function getHandle() { return document.querySelector("[data-hud-handle]"); }

  function setMode(mode) {
    const m = VALID.has(mode) ? mode : "full";
    document.documentElement.dataset.zzxHud = m;
    try { localStorage.setItem(STORAGE_KEY, m); } catch (_) {}

    const root = getRoot();
    const handle = getHandle();

    // Root visibility
    if (root) root.dataset.hudState = m;

    // Handle visibility: shown only when hidden
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

  function bindHandleOnce() {
    const btn = document.querySelector("[data-hud-show]");
    if (!btn || btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", () => setMode("full"));
  }

  function boot(defaultMode = "full") {
    const m = getMode() || defaultMode;
    setMode(m);
    bindHandleOnce();
  }

  window.ZZXHudState = { boot, setMode, getMode };
})();
