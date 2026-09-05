// __partials/widgets/hud-state.js
// SINGLE SOURCE OF TRUTH — DROP-IN REPLACEMENT
//
// Canonical HUD modes:
//   "full" | "ticker-only" | "hidden"
//
// RESPONSIBILITIES:
// - Persist HUD mode in localStorage when available.
// - Preserve an in-memory fallback when storage is unavailable.
// - Expose ONE state authority: window.ZZXHUD.
// - Apply mode to ALL [data-hud-root] elements.
// - Show [data-hud-handle] ONLY when HUD is hidden.
// - Provide a HUD control bar:
//       Full | Ticker | Hide                         Reset
// - Support controls created by widgets/runtime later.
// - Survive partial/HUD reinjection.
// - Synchronize HUD state across browser tabs.
// - Emit HUD state-change events.
// - Remain safe and idempotent if loaded more than once.
//
// IMPORTANT:
// - Does NOT remove or replace any widget.
// - Does NOT assume the runtime widget is absent.
// - If a runtime widget exists, its data-hud-* controls coexist with this bar.

(function () {
  "use strict";

  const W = window;
  const D = document;

  const KEY = "zzx.hud.mode";

  const VALID = new Set([
    "full",
    "ticker-only",
    "hidden"
  ]);

  let memoryMode = null;


  // ===========================================================================
  // MODE NORMALIZATION
  // ===========================================================================

  function normalize(mode) {
    if (
      mode &&
      typeof mode === "object" &&
      "mode" in mode
    ) {
      mode = mode.mode;
    }

    if (!mode) {
      return "full";
    }

    let m = String(mode)
      .trim()
      .toLowerCase();

    // Historical/backward-compatible aliases.
    switch (m) {
      case "ticker":
      case "ticker_only":
      case "tickeronly":
        m = "ticker-only";
        break;

      case "visible":
      case "show":
      case "shown":
      case "open":
        m = "full";
        break;

      case "hide":
      case "closed":
        m = "hidden";
        break;
    }

    return VALID.has(m)
      ? m
      : "full";
  }


  // ===========================================================================
  // STORAGE
  // ===========================================================================

  function safeGet() {
    try {
      const value =
        W.localStorage.getItem(KEY);

      if (value !== null) {
        memoryMode = value;
        return value;
      }
    } catch (_) {}

    return memoryMode;
  }


  function safeSet(value) {
    const mode = normalize(value);

    memoryMode = mode;

    try {
      W.localStorage.setItem(
        KEY,
        mode
      );
    } catch (_) {}

    return mode;
  }


  function safeDel() {
    memoryMode = null;

    try {
      W.localStorage.removeItem(KEY);
    } catch (_) {}
  }


  // ===========================================================================
  // STATE READ
  // ===========================================================================

  function read() {
    return {
      mode: normalize(
        safeGet()
      )
    };
  }


  // ===========================================================================
  // CONTROL STATE
  // ===========================================================================

  function syncControls(mode) {
    const m = normalize(mode);

    const modeButtons =
      D.querySelectorAll(
        "[data-hud-mode]"
      );

    for (const btn of modeButtons) {
      const buttonMode =
        normalize(
          btn.getAttribute(
            "data-hud-mode"
          )
        );

      const active =
        buttonMode === m;

      try {
        btn.setAttribute(
          "aria-pressed",
          active ? "true" : "false"
        );

        if (active) {
          btn.setAttribute(
            "data-hud-active",
            "1"
          );
        } else {
          btn.removeAttribute(
            "data-hud-active"
          );
        }
      } catch (_) {}
    }
  }


  // ===========================================================================
  // APPLY STATE TO DOM
  // ===========================================================================

  function applyToDOM(mode) {
    const m = normalize(mode);

    // Apply state to every HUD root.
    const roots =
      D.querySelectorAll(
        "[data-hud-root]"
      );

    for (const root of roots) {
      try {
        root.setAttribute(
          "data-hud-state",
          m
        );

        root.setAttribute(
          "aria-hidden",
          m === "hidden"
            ? "true"
            : "false"
        );
      } catch (_) {}
    }

    // Recovery handle exists outside the hidden HUD.
    const handles =
      D.querySelectorAll(
        "[data-hud-handle], .zzx-hud-handle"
      );

    for (const handle of handles) {
      try {
        const visible =
          m === "hidden";

        // Explicit inline state backs up the CSS :has()
        // implementation and older browser fallback.
        handle.style.display =
          visible
            ? "flex"
            : "none";

        handle.setAttribute(
          "aria-hidden",
          visible
            ? "false"
            : "true"
        );
      } catch (_) {}
    }

    syncControls(m);

    return m;
  }


  // ===========================================================================
  // EVENTS
  // ===========================================================================

  function emit(mode) {
    const m = normalize(mode);

    const detail = {
      mode: m
    };

    // Support both historical event-name styles used by the site.
    try {
      W.dispatchEvent(
        new CustomEvent(
          "zzx:hud-state",
          {
            detail
          }
        )
      );
    } catch (_) {}

    try {
      W.dispatchEvent(
        new CustomEvent(
          "zzx:hud:state",
          {
            detail
          }
        )
      );
    } catch (_) {}
  }


  // ===========================================================================
  // WRITE
  // ===========================================================================

  function write(mode) {
    const m =
      safeSet(
        normalize(mode)
      );

    applyToDOM(m);
    emit(m);

    return {
      mode: m
    };
  }


  // ===========================================================================
  // RESET
  // ===========================================================================

  function reset() {
    safeDel();

    // Full is the canonical default.
    // Persist the resulting canonical mode.
    const m =
      safeSet("full");

    applyToDOM(m);
    emit(m);

    return {
      mode: m
    };
  }


  // ===========================================================================
  // HUD CONTROL BAR
  // ===========================================================================

  function makeModeButton(
    label,
    mode,
    aria
  ) {
    const button =
      D.createElement("button");

    button.type = "button";

    button.className =
      "zzx-widgets__btn";

    button.setAttribute(
      "data-hud-mode",
      mode
    );

    button.setAttribute(
      "aria-label",
      aria
    );

    button.setAttribute(
      "aria-pressed",
      "false"
    );

    button.textContent = label;

    return button;
  }


  function ensureHudBar(root) {
    if (!root) return null;

    let bar =
      root.querySelector(
        ":scope > .zzx-widgets__bar[data-hud-bar]"
      );

    // :scope fallback for older browsers.
    if (!bar) {
      const candidates =
        root.querySelectorAll(
          ".zzx-widgets__bar[data-hud-bar]"
        );

      for (const candidate of candidates) {
        if (
          candidate.parentElement === root
        ) {
          bar = candidate;
          break;
        }
      }
    }

    if (bar) {
      return bar;
    }

    bar =
      D.createElement("div");

    bar.className =
      "zzx-widgets__bar";

    bar.setAttribute(
      "data-hud-bar",
      "1"
    );

    bar.setAttribute(
      "role",
      "toolbar"
    );

    bar.setAttribute(
      "aria-label",
      "Bitcoin HUD controls"
    );


    // -------------------------------------------------------
    // FULL
    // -------------------------------------------------------

    const btnFull =
      makeModeButton(
        "Full",
        "full",
        "HUD mode: Full"
      );


    // -------------------------------------------------------
    // TICKER
    // -------------------------------------------------------

    const btnTicker =
      makeModeButton(
        "Ticker",
        "ticker-only",
        "HUD mode: Ticker only"
      );


    // -------------------------------------------------------
    // HIDE
    // -------------------------------------------------------

    const btnHide =
      makeModeButton(
        "Hide",
        "hidden",
        "HUD mode: Hidden"
      );


    // -------------------------------------------------------
    // SPACER
    // -------------------------------------------------------

    const spacer =
      D.createElement("span");

    spacer.className =
      "zzx-widgets__spacer";

    spacer.setAttribute(
      "aria-hidden",
      "true"
    );


    // -------------------------------------------------------
    // RESET
    // -------------------------------------------------------

    const btnReset =
      D.createElement("button");

    btnReset.type = "button";

    btnReset.className =
      "zzx-widgets__btn";

    btnReset.setAttribute(
      "data-hud-reset",
      "1"
    );

    btnReset.setAttribute(
      "aria-label",
      "Reset HUD mode"
    );

    btnReset.textContent =
      "Reset";


    // -------------------------------------------------------
    // ASSEMBLE
    // -------------------------------------------------------

    bar.appendChild(btnFull);
    bar.appendChild(btnTicker);
    bar.appendChild(btnHide);

    bar.appendChild(spacer);

    bar.appendChild(btnReset);


    // Control bar is always first inside the HUD.
    root.insertBefore(
      bar,
      root.firstChild
    );

    return bar;
  }


  // ===========================================================================
  // ENSURE ALL HUD ROOTS
  // ===========================================================================

  function ensureBars() {
    const roots =
      D.querySelectorAll(
        "[data-hud-root]"
      );

    for (const root of roots) {
      ensureHudBar(root);
    }
  }


  // ===========================================================================
  // DELEGATED UI CONTROLS
  // ===========================================================================
  //
  // Delegation means:
  // - HUD controls inserted later automatically work.
  // - A recovered runtime widget may use the same attributes.
  // - Partial reinjection requires no per-button rebinding.
  // ===========================================================================

  function installDelegatedControls() {
    if (
      W.__ZZX_HUD_DELEGATED_CONTROLS
    ) {
      return;
    }

    W.__ZZX_HUD_DELEGATED_CONTROLS =
      true;

    D.addEventListener(
      "click",
      (event) => {
        try {
          const target =
            event.target;

          if (
            !target ||
            target.nodeType !== 1
          ) {
            return;
          }


          // -------------------------------------------------
          // External HUD recovery button
          // -------------------------------------------------

          const show =
            target.closest(
              "[data-hud-show]"
            );

          if (show) {
            write("full");
            return;
          }


          // -------------------------------------------------
          // Mode controls
          // -------------------------------------------------

          const modeButton =
            target.closest(
              "[data-hud-mode]"
            );

          if (modeButton) {
            const mode =
              modeButton.getAttribute(
                "data-hud-mode"
              );

            if (mode) {
              write(mode);
            }

            return;
          }


          // -------------------------------------------------
          // Reset control
          // -------------------------------------------------

          const resetButton =
            target.closest(
              "[data-hud-reset]"
            );

          if (resetButton) {
            reset();
          }

        } catch (_) {}
      }
    );
  }


  // ===========================================================================
  // INITIAL / REINJECTION DOM RECONCILIATION
  // ===========================================================================

  function bootDOM() {
    try {
      ensureBars();

      const stored =
        safeGet();

      let initial;

      if (stored === null) {
        // No saved preference.
        // Adopt explicit HTML state if present.
        const root =
          D.querySelector(
            "[data-hud-root][data-hud-state]"
          );

        initial =
          root
            ? normalize(
                root.getAttribute(
                  "data-hud-state"
                )
              )
            : "full";

        safeSet(initial);

      } else {
        // Normalize/migrate historical values and write
        // the canonical representation back to storage.
        initial =
          normalize(stored);

        if (stored !== initial) {
          safeSet(initial);
        }
      }

      applyToDOM(initial);

    } catch (_) {}
  }


  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  const previous =
    W.ZZXHUD || {};

  W.ZZXHUD = Object.assign(
    {},
    previous,
    {
      read,
      write,
      reset,
      normalize,
      apply: applyToDOM,
      ensureBars
    }
  );


  // ===========================================================================
  // INSTALL DOM CONTROLLER ONCE
  // ===========================================================================

  installDelegatedControls();


  if (
    !W.__ZZX_HUD_STATE_DOM_BOOTED
  ) {
    W.__ZZX_HUD_STATE_DOM_BOOTED =
      true;


    // -------------------------------------------------------------------------
    // DOM readiness
    // -------------------------------------------------------------------------

    if (
      D.readyState === "loading"
    ) {
      D.addEventListener(
        "DOMContentLoaded",
        bootDOM,
        {
          once: true
        }
      );
    } else {
      bootDOM();
    }


    // -------------------------------------------------------------------------
    // Historical partial-ready event variants
    // -------------------------------------------------------------------------

    W.addEventListener(
      "zzx:partials-ready",
      bootDOM
    );

    W.addEventListener(
      "zzx:partials:ready",
      bootDOM
    );


    // -------------------------------------------------------------------------
    // Cross-tab synchronization
    // -------------------------------------------------------------------------

    W.addEventListener(
      "storage",
      (event) => {
        try {
          if (
            event.storageArea !==
              W.localStorage ||
            event.key !== KEY
          ) {
            return;
          }

          const mode =
            normalize(
              event.newValue ||
              "full"
            );

          memoryMode = mode;

          applyToDOM(mode);
          emit(mode);

        } catch (_) {}
      }
    );


    // -------------------------------------------------------------------------
    // HUD reinjection observer
    // -------------------------------------------------------------------------

    try {
      const observer =
        new MutationObserver(
          (mutations) => {
            for (
              const mutation
              of mutations
            ) {
              if (
                mutation.type !==
                "childList"
              ) {
                continue;
              }

              for (
                const node
                of mutation.addedNodes
              ) {
                if (
                  !node ||
                  node.nodeType !== 1
                ) {
                  continue;
                }

                let relevant = false;

                try {
                  relevant =
                    Boolean(
                      node.matches &&
                      (
                        node.matches(
                          "[data-hud-root]"
                        ) ||
                        node.matches(
                          "[data-hud-handle]"
                        ) ||
                        node.matches(
                          "[data-hud-show]"
                        )
                      )
                    );

                  if (
                    !relevant &&
                    node.querySelector
                  ) {
                    relevant =
                      Boolean(
                        node.querySelector(
                          "[data-hud-root]"
                        ) ||
                        node.querySelector(
                          "[data-hud-handle]"
                        ) ||
                        node.querySelector(
                          "[data-hud-show]"
                        )
                      );
                  }
                } catch (_) {}

                if (relevant) {
                  bootDOM();
                  return;
                }
              }
            }
          }
        );

      observer.observe(
        D.documentElement,
        {
          childList: true,
          subtree: true
        }
      );

      D.__zzxHudStateObserver =
        observer;

    } catch (_) {}
  }


  // ===========================================================================
  // RECONCILE EVEN WHEN SCRIPT WAS RE-INJECTED
  // ===========================================================================

  // The controller itself is installed once, but a subsequent script load
  // should still reconcile the current DOM with the authoritative state.
  try {
    bootDOM();
  } catch (_) {}

})();
