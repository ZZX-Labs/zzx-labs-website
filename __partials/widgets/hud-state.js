// __partials/widgets/hud-state.js
// SINGLE SOURCE OF TRUTH — DROP-IN REPLACEMENT
//
// Canonical HUD modes:
//   "full" | "ticker-only" | "hidden"
//
// What this file MUST do (to stop your “Hide = disappears forever” bug):
// - Persist mode in localStorage
// - Expose ONE authority: window.ZZXHUD
// - APPLY mode to DOM:
//     * set [data-hud-root][data-hud-state="<mode>"]
//     * show [data-hud-handle] ONLY when mode === "hidden"
// - Wire buttons if present:
//     * [data-hud-show] => set mode "full"
//
// Safe if loaded multiple times; never throws.

(function () {
  "use strict";

  const W = window;
  const D = document;

  const KEY = "zzx.hud.mode";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  function normalize(mode) {
    if (mode && typeof mode === "object" && "mode" in mode) mode = mode.mode;
    if (!mode) return "full";

    let m = String(mode).trim().toLowerCase();

    // Back-compat aliases
    if (m === "ticker") m = "ticker-only";
    if (m === "ticker_only") m = "ticker-only";
    if (m === "tickeronly") m = "ticker-only";
    if (m === "visible") m = "full";

    return VALID.has(m) ? m : "full";
  }

  function safeGet() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function safeSet(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }
  function safeDel() {
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  function read() {
    return { mode: normalize(safeGet()) };
  }

  function write(mode) {
    const m = normalize(mode);
    safeSet(m);
    applyToDOM(m);
    return { mode: m };
  }

  function reset() {
    safeDel();
    applyToDOM("full");
    return { mode: "full" };
  }

  // ---- DOM binding (this is what you were missing) ----
  function applyToDOM(mode) {
    const m = normalize(mode);

    // apply state to ALL hud roots present
    const roots = D.querySelectorAll("[data-hud-root]");
    for (const r of roots) r.setAttribute("data-hud-state", m);

    // handle should be visible ONLY when hidden
    const handles = D.querySelectorAll("[data-hud-handle], .zzx-hud-handle");
    for (const h of handles) {
      // let CSS handle it if it wants; but force correct fallback state
      h.style.display = (m === "hidden") ? "flex" : "none";
    }
  }

  function wireUI() {
    // Show button (the only thing in wrapper HTML outside the root)
    const showBtns = D.querySelectorAll("[data-hud-show]");
    for (const btn of showBtns) {
      if (btn.dataset.zzxHudBound === "1") continue;
      btn.dataset.zzxHudBound = "1";
      btn.addEventListener("click", () => write("full"));
    }
  }

  function bootDOM() {
    // 1) Apply persisted mode (or default)
    const m = read().mode;

    // If wrapper HTML sets data-hud-state explicitly, respect it ONLY if storage is empty.
    // Storage wins otherwise.
    const stored = safeGet();
    if (!stored) {
      // if any root has a valid explicit state, adopt it and persist
      const root = D.querySelector("[data-hud-root][data-hud-state]");
      const initial = root ? normalize(root.getAttribute("data-hud-state")) : m;
      safeSet(initial);
      applyToDOM(initial);
    } else {
      applyToDOM(m);
    }

    // 2) Wire buttons
    wireUI();
  }

  // Preserve any existing object but HARD-SET the contract
  const prev = W.ZZXHUD || {};
  W.ZZXHUD = { ...prev, read, write, reset, normalize };

  // Idempotent DOM boot (important because your shell is injected later by ticker-loader)
  if (!W.__ZZX_HUD_STATE_DOM_BOOTED) {
    W.__ZZX_HUD_STATE_DOM_BOOTED = true;

    // run now if possible
    if (D.readyState === "loading") {
      D.addEventListener("DOMContentLoaded", bootDOM, { once: true });
    } else {
      bootDOM();
    }

    // if ticker-loader injects wrapper AFTER this loads, re-bind and re-apply
    W.addEventListener("zzx:partials-ready", bootDOM);
    W.addEventListener("zzx:partials:ready", bootDOM);

    // also observe late insertion of the HUD shell (covers race where no events fire)
    try {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type !== "childList") continue;
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (
              (n.matches && (n.matches("[data-hud-root]") || n.matches("[data-hud-handle]") || n.matches("[data-hud-show]"))) ||
              (n.querySelector && (n.querySelector("[data-hud-root]") || n.querySelector("[data-hud-handle]") || n.querySelector("[data-hud-show]")))
            ) {
              bootDOM();
              return;
            }
          }
        }
      });
      mo.observe(D.documentElement, { childList: true, subtree: true });
      D.__zzxHudStateObserver = mo;
    } catch (_) {}
  }
})();
