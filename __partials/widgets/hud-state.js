// hud-state.js (or inside runtime/core)
// Persists state + guarantees recovery handle always works.

(function () {
  const KEY = "zzx.hud.state"; // "full" | "ticker-only" | "hidden"

  function getHost() {
    // pick something stable that always exists when the widget exists:
    return document.getElementById("ticker-container") || document.body;
  }

  function setState(state) {
    const host = getHost();
    host.setAttribute("data-hud-state", state);
    try { localStorage.setItem(KEY, state); } catch {}
    syncHandleVisibility();
  }

  function getState() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "full" || v === "ticker-only" || v === "hidden") return v;
    } catch {}
    return "full";
  }

  function syncHandleVisibility() {
    const host = getHost();
    const state = host.getAttribute("data-hud-state") || "full";
    const handle = document.querySelector(".zzx-hud-handle[data-hud-handle]");
    if (!handle) return;
    // show handle only when hidden
    handle.hidden = (state !== "hidden");
  }

  function bind() {
    const host = getHost();
    host.setAttribute("data-hud-state", getState());

    // Recovery handle: always bind if it exists
    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__bound) {
      showBtn.__bound = true;
      showBtn.addEventListener("click", () => setState("full"));
    }

    syncHandleVisibility();
  }

  // initial + reinjection safe
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  // expose for your runtime buttons to call:
  window.ZZXHUD = { setState, getState };
})();
