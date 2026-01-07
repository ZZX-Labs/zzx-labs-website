// __partials/widgets/hud-state.js
// SINGLE SOURCE OF TRUTH — DROP-IN REPLACEMENT
//
// Canonical HUD modes:
//   "full" | "ticker-only" | "hidden"
//
// MUST DO:
// - Persist mode in localStorage
// - Expose ONE authority: window.ZZXHUD
// - APPLY mode to DOM:
//     * set [data-hud-root][data-hud-state="<mode>"]
//     * show [data-hud-handle] ONLY when mode === "hidden"
// - Provide HUD control bar INSIDE the HUD root (since runtime widget is removed):
//     * Left: Full | Ticker | Hide
//     * Right: Reset
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

  function applyToDOM(mode) {
    const m = normalize(mode);

    // Apply state to ALL HUD roots present
    const roots = D.querySelectorAll("[data-hud-root]");
    for (const r of roots) r.setAttribute("data-hud-state", m);

    // Handle visible ONLY when hidden (force fallback state even if CSS is present)
    const handles = D.querySelectorAll("[data-hud-handle], .zzx-hud-handle");
    for (const h of handles) {
      h.style.display = (m === "hidden") ? "flex" : "none";
    }
  }

  function write(mode) {
    const m = normalize(mode);
    safeSet(m);
    applyToDOM(m);
    return { mode: m };
  }

  function reset() {
    safeDel();
    safeSet("full");
    applyToDOM("full");
    return { mode: "full" };
  }

  // ---- HUD Control Bar (replaces removed runtime widget) ----
  function ensureHudBar(root) {
    if (!root) return null;

    // If already present, reuse
    let bar = root.querySelector(".zzx-widgets__bar[data-hud-bar]");
    if (bar) return bar;

    bar = D.createElement("div");
    bar.className = "zzx-widgets__bar";
    bar.setAttribute("data-hud-bar", "1");

    // Left controls
    const btnFull = D.createElement("button");
    btnFull.type = "button";
    btnFull.className = "zzx-widgets__btn";
    btnFull.setAttribute("data-hud-mode", "full");
    btnFull.setAttribute("aria-label", "HUD mode: Full");
    btnFull.textContent = "Full";

    const btnTicker = D.createElement("button");
    btnTicker.type = "button";
    btnTicker.className = "zzx-widgets__btn";
    btnTicker.setAttribute("data-hud-mode", "ticker-only");
    btnTicker.setAttribute("aria-label", "HUD mode: Ticker only");
    btnTicker.textContent = "Ticker";

    const btnHide = D.createElement("button");
    btnHide.type = "button";
    btnHide.className = "zzx-widgets__btn";
    btnHide.setAttribute("data-hud-mode", "hidden");
    btnHide.setAttribute("aria-label", "HUD mode: Hidden");
    btnHide.textContent = "Hide";

    // Spacer pushes Reset to the right
    const spacer = D.createElement("span");
    spacer.className = "zzx-widgets__spacer";
    spacer.setAttribute("aria-hidden", "true");

    // Right control
    const btnReset = D.createElement("button");
    btnReset.type = "button";
    btnReset.className = "zzx-widgets__btn";
    btnReset.setAttribute("data-hud-reset", "1");
    btnReset.setAttribute("aria-label", "Reset HUD");
    btnReset.textContent = "Reset";

    bar.appendChild(btnFull);
    bar.appendChild(btnTicker);
    bar.appendChild(btnHide);
    bar.appendChild(spacer);
    bar.appendChild(btnReset);

    // Insert at top of HUD root
    root.insertBefore(bar, root.firstChild);

    return bar;
  }

  function wireUI() {
    // 1) "HUD" show button outside the root
    const showBtns = D.querySelectorAll("[data-hud-show]");
    for (const btn of showBtns) {
      if (btn.dataset.zzxHudBound === "1") continue;
      btn.dataset.zzxHudBound = "1";
      btn.addEventListener("click", () => write("full"));
    }

    // 2) Ensure + bind bar for each root
    const roots = D.querySelectorAll("[data-hud-root]");
    for (const root of roots) {
      const bar = ensureHudBar(root);
      if (!bar) continue;

      if (bar.dataset.zzxHudBarBound === "1") continue;
      bar.dataset.zzxHudBarBound = "1";

      bar.addEventListener("click", (ev) => {
        const t = ev.target;
        if (!t || t.nodeType !== 1) return;

        const mode = t.getAttribute("data-hud-mode");
        if (mode) {
          write(mode);
          return;
        }

        if (t.hasAttribute("data-hud-reset")) {
          reset();
          return;
        }
      });
    }
  }

  function bootDOM() {
    // Storage wins; if empty, adopt any explicit DOM state and persist it
    const stored = safeGet();
    if (!stored) {
      const root = D.querySelector("[data-hud-root][data-hud-state]");
      const initial = root ? normalize(root.getAttribute("data-hud-state")) : "full";
      safeSet(initial);
      applyToDOM(initial);
    } else {
      applyToDOM(read().mode);
    }

    wireUI();
  }

  // Preserve any existing object but HARD-SET the contract
  const prev = W.ZZXHUD || {};
  W.ZZXHUD = { ...prev, read, write, reset, normalize };

  // Idempotent DOM boot (shell is injected later by ticker-loader)
  if (!W.__ZZX_HUD_STATE_DOM_BOOTED) {
    W.__ZZX_HUD_STATE_DOM_BOOTED = true;

    if (D.readyState === "loading") {
      D.addEventListener("DOMContentLoaded", bootDOM, { once: true });
    } else {
      bootDOM();
    }

    W.addEventListener("zzx:partials-ready", bootDOM);
    W.addEventListener("zzx:partials:ready", bootDOM);

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
