/* __partials/widgets/runtime/widget.js */
/* DROP-IN REPLACEMENT (final hardened) */
/* Purpose: HUD controls only. Manifest/widget mounting is handled by __partials/widgets/runtime.js */

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Idempotent boot
  if (W.__ZZX_HUD_WIDGET_BOOTED) return;
  W.__ZZX_HUD_WIDGET_BOOTED = true;

  // ----------------------------
  // Canonical HUD modes
  // ----------------------------
  const KEY = "zzx.hud.mode";
  const DEFAULT_MODE = "full";
  const VALID = new Set(["full", "ticker-only", "hidden"]);

  const qs = (sel, scope) => (scope || D).querySelector(sel);

  function normalizeMode(mode) {
    // tolerate object payloads: { mode: "..." }
    if (mode && typeof mode === "object" && "mode" in mode) mode = mode.mode;

    let m = String(mode || "").trim().toLowerCase();

    // Back-compat aliases you had floating around
    if (m === "ticker") m = "ticker-only";
    if (m === "show") m = "full";
    if (m === "hide") m = "hidden";
    if (m === "visible") m = "full";

    return VALID.has(m) ? m : DEFAULT_MODE;
  }

  // ----------------------------
  // Ensure ZZXHUD exists (shim)
  // ----------------------------
  function ensureHUD() {
    if (
      W.ZZXHUD &&
      typeof W.ZZXHUD.read === "function" &&
      typeof W.ZZXHUD.write === "function" &&
      typeof W.ZZXHUD.reset === "function"
    ) {
      // ensure normalize exists
      if (typeof W.ZZXHUD.normalize !== "function") {
        W.ZZXHUD.normalize = (m) => ({ mode: normalizeMode(m) });
      }
      return W.ZZXHUD;
    }

    // Minimal, deterministic shim
    W.ZZXHUD = {
      normalize: (m) => ({ mode: normalizeMode(m) }),
      read: () => {
        try {
          return { mode: normalizeMode(localStorage.getItem(KEY)) };
        } catch (_) {
          return { mode: DEFAULT_MODE };
        }
      },
      write: (m) => {
        const mode = normalizeMode(m);
        try { localStorage.setItem(KEY, mode); } catch (_) {}
        return { mode };
      },
      reset: () => {
        try { localStorage.removeItem(KEY); } catch (_) {}
        return { mode: DEFAULT_MODE };
      },
    };

    return W.ZZXHUD;
  }

  // ----------------------------
  // Apply state -> DOM
  // ----------------------------
  function applyToDOM(mode) {
    const m = normalizeMode(mode);

    const root   = qs("[data-hud-root]");
    const handle = qs("[data-hud-handle]");
    const label  = qs("[data-runtime-mode]");

    if (root) root.setAttribute("data-hud-state", m);

    // Handle lives OUTSIDE the root in your wrapper, so JS controls it explicitly
    if (handle) handle.style.display = (m === "hidden") ? "flex" : "none";

    if (label) label.textContent = m;

    return m;
  }

  function readMode() {
    const HUD = ensureHUD();
    try {
      return normalizeMode(HUD.read());
    } catch (_) {
      // last-resort fallback to DOM
      return normalizeMode(qs("[data-hud-root]")?.getAttribute("data-hud-state"));
    }
  }

  function writeMode(mode) {
    const HUD = ensureHUD();
    const m = normalizeMode(mode);
    try { HUD.write(m); } catch (_) {}
    return applyToDOM(m);
  }

  function resetMode() {
    const HUD = ensureHUD();
    let res;
    try { res = HUD.reset(); } catch (_) { res = { mode: DEFAULT_MODE }; }
    return applyToDOM(res);
  }

  // ----------------------------
  // Delegated bindings (works for late-injected DOM)
  // ----------------------------
  function bindDelegated() {
    if (D.__zzxHudDelegatedBound) return;
    D.__zzxHudDelegatedBound = true;

    D.addEventListener("click", (ev) => {
      const t = ev.target;

      // Mode buttons (Full/Ticker/Hide)
      const modeBtn = t && t.closest ? t.closest("[data-hud-mode]") : null;
      if (modeBtn) {
        ev.preventDefault();
        writeMode(modeBtn.getAttribute("data-hud-mode"));
        return;
      }

      // Reset button
      const resetBtn = t && t.closest ? t.closest('[data-hud-action="reset"]') : null;
      if (resetBtn) {
        ev.preventDefault();
        resetMode();
        return;
      }

      // Handle/icon show button (bring HUD back)
      const showBtn = t && t.closest ? t.closest("[data-hud-show]") : null;
      if (showBtn) {
        ev.preventDefault();
        const cur = readMode();
        writeMode(cur === "hidden" ? "full" : "hidden"); // toggle
        return;
      }

      // If someone clicks the handle container itself, also show
      const handle = t && t.closest ? t.closest("[data-hud-handle]") : null;
      if (handle) {
        // only do something if currently hidden
        if (readMode() === "hidden") writeMode("full");
      }
    }, { passive: false });

    // ESC hides (unless Credits modal open)
    W.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;

      const cm = D.getElementById("zzx-credits-modal");
      if (cm && cm.hidden === false) return;

      if (readMode() !== "hidden") writeMode("hidden");
    });
  }

  // ----------------------------
  // Init
  // ----------------------------
  function init() {
    ensureHUD();
    bindDelegated();
    applyToDOM(readMode());
  }

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
