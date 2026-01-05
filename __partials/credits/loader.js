// __partials/credits/loader.js
// ZZX Credits Loader — SINGLE-SOURCE-OF-TRUTH (DROP-IN REPLACEMENT)
//
// Fixes your current mess (3 credits UIs) by doing ONE thing:
// - Use ONLY the existing footer button: #footer-credits-btn
// - Open a fixed, center-aligned modal overlay (X + ESC + backdrop click to close)
// - Load the credits CONTENT into the modal (credits.html preferred; credits.js fallback)
// - Remove/disable legacy injected credits buttons/panels so nothing collapses the page
//
// IMPORTANT:
// - Keep your correct footer placement button in footer.html:
//     <button id="footer-credits-btn" class="footer-credits-btn" ...>Credits</button>
// - This loader intentionally does NOT create any extra footer credits buttons.
// - This loader is prefix-aware (works from any directory depth).

(() => {
  "use strict";

  const W = window;

  // Hard stop duplicate boots
  if (W.__ZZX_CREDITS_MODAL_LOADER_BOOTED) return;
  W.__ZZX_CREDITS_MODAL_LOADER_BOOTED = true;

  const STATE_KEY = "zzx.credits.modal.open";

  // -----------------------------
  // Prefix-aware URL join
  // -----------------------------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1.replace(/\/+$/, "");
    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2.replace(/\/+$/, "");
    return "."; // safe default for deep pages
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);
    if (/^https?:\/\//i.test(s)) return s;
    if (prefix === "/") return s;
    if (!s.startsWith("/")) return s;
    return prefix.replace(/\/+$/, "") + s;
  }

  // Propagate cache-bust from current script if present
  function cacheBustSuffix() {
    try {
      const src = document.currentScript?.getAttribute("src") || "";
      if (src.includes("?")) return src.slice(src.indexOf("?"));
    } catch (_) {}
    return "";
  }

  // -----------------------------
  // DOM helpers
  // -----------------------------
  const qs = (sel, scope) => (scope || document).querySelector(sel);
  const qsa = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  function ensureCSSOnce(key, href) {
    const sel = `link[data-zzx-credits-css="${key}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-credits-css", key);
    document.head.appendChild(l);
  }

  function readOpen() {
    try { return localStorage.getItem(STATE_KEY) === "1"; } catch (_) { return false; }
  }
  function writeOpen(v) {
    try { localStorage.setItem(STATE_KEY, v ? "1" : "0"); } catch (_) {}
  }

  // -----------------------------
  // LEGACY CLEANUP (kills the other 2 credits UIs)
  // -----------------------------
  function cleanupLegacyCreditsUIs() {
    // 1) Remove the old inline "Made by ..." badge if injected
    qsa(".zzx-credits").forEach((el) => {
      // keep if it is inside our modal body (should not be), otherwise remove
      const inModal = !!el.closest(".zzx-credits-dialog");
      if (!inModal) el.remove();
    });

    // 2) Remove old host wrappers / toggles that create the i-in-circle and/or collapsing panel
    //    (These are from the earlier loader that created [data-zzx-credits-host] + toggle button.)
    qsa("[data-zzx-credits-host]").forEach((host) => host.remove());
    qsa("[data-zzx-credits-toggle]").forEach((btn) => btn.remove());

    // 3) Remove old bottom-collapsing panel mount if present
    const oldPanel = document.getElementById("zzx-credits");
    if (oldPanel && !oldPanel.closest(".zzx-credits-dialog")) oldPanel.remove();

    // 4) Prevent old credits.js from mounting a footer badge again (best-effort)
    //    If it already ran, the DOM removal above handles it.
    W.__ZZX_CREDITS_BOOTED = true;
    W.__ZZX_CREDITS_LOADER_BOOTED = true;
  }

  // -----------------------------
  // MODAL CREATION
  // -----------------------------
  function ensureModal() {
    let modal = document.getElementById("zzx-credits-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "zzx-credits-modal";
    modal.className = "zzx-credits-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Credits");
    modal.hidden = true;

    modal.innerHTML = `
      <div class="zzx-credits-dialog" role="document">
        <div class="zzx-credits-head">
          <h2>Credits</h2>
          <button type="button" class="zzx-credits-x" data-zzx-credits-close aria-label="Close credits">✕</button>
        </div>
        <div class="zzx-credits-body" data-zzx-credits-body>
          <div class="zzx-credits-loading">Loading…</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function isOpen(modal) {
    return !modal.hidden;
  }

  function openModal(modal) {
    modal.hidden = false;
    writeOpen(true);
    // lock background scroll gently (optional, reversible)
    document.documentElement.classList.add("zzx-modal-open");
    document.body.classList.add("zzx-modal-open");
  }

  function closeModal(modal) {
    modal.hidden = true;
    writeOpen(false);
    document.documentElement.classList.remove("zzx-modal-open");
    document.body.classList.remove("zzx-modal-open");
  }

  // -----------------------------
  // CONTENT LOADING
  // -----------------------------
  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  // Strategy:
  // 1) Prefer /__partials/credits/credits.html (static content)
  // 2) Fallback to /__partials/credits/credits.js (renders something)
  async function ensureCreditsContent(modal) {
    const body = qs("[data-zzx-credits-body]", modal);
    if (!body) return;

    if (body.dataset.zzxLoaded === "1") return; // already loaded once

    const prefix = getPrefix();
    const qsuf = cacheBustSuffix();

    const htmlURL = join(prefix, `/__partials/credits/credits.html${qsuf}`);
    const jsURL   = join(prefix, `/__partials/credits/credits.js${qsuf}`);

    // Attempt HTML first
    try {
      const html = await fetchText(htmlURL);
      body.innerHTML = html;
      body.dataset.zzxLoaded = "1";
      return;
    } catch (e) {
      // Continue to JS fallback
      console.warn("[Credits] credits.html not available, falling back to credits.js:", e?.message || e);
    }

    // JS fallback: run credits.js into this modal body without letting it append to footer
    // We do that by temporarily providing a known mount node and monkey-patching appendChild targets.
    try {
      // Provide a dedicated mount target
      const mount = document.createElement("div");
      mount.setAttribute("data-zzx-credits-in-modal", "1");
      mount.innerHTML = `<div class="zzx-credits-loading">Loading…</div>`;
      body.replaceChildren(mount);

      // Mark to discourage footer mounting
      W.__ZZX_CREDITS_BOOTED = false;

      // Load credits.js once
      if (!document.querySelector('script[data-zzx-credits-modal-js="1"]')) {
        await new Promise((resolve) => {
          const s = document.createElement("script");
          s.src = jsURL;
          s.defer = true;
          s.setAttribute("data-zzx-credits-modal-js", "1");
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.body.appendChild(s);
        });
      }

      // credits.js (your current version) appends .zzx-credits to footer/body.
      // We immediately move that into the modal body and remove any duplicates elsewhere.
      const injected = document.querySelector(".zzx-credits");
      if (injected) {
        // remove other instances first
        qsa(".zzx-credits").forEach((el, idx) => { if (idx > 0) el.remove(); });
        body.replaceChildren(injected);
        body.dataset.zzxLoaded = "1";
      } else {
        body.innerHTML =
          `<div class="zzx-credits-loading">Credits loaded, but no content was rendered.</div>`;
        body.dataset.zzxLoaded = "1";
      }
    } catch (e) {
      console.warn("[Credits] credits.js fallback failed:", e);
      body.innerHTML =
        `<div class="zzx-credits-loading">Credits failed to load.</div>`;
      body.dataset.zzxLoaded = "1";
    }
  }

  // -----------------------------
  // BINDINGS
  // -----------------------------
  function bindModalControls(modal) {
    // X button
    const x = qs("[data-zzx-credits-close]", modal);
    if (x && !x.__zzxBound) {
      x.__zzxBound = true;
      x.addEventListener("click", () => closeModal(modal));
    }

    // Backdrop click closes (but not clicks inside dialog)
    if (!modal.__zzxBackdropBound) {
      modal.__zzxBackdropBound = true;
      modal.addEventListener("click", (ev) => {
        if (ev.target === modal) closeModal(modal);
      });
    }

    // ESC closes
    if (!W.__zzxCreditsEscBound) {
      W.__zzxCreditsEscBound = true;
      window.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" || ev.key === "Esc") {
          const m = document.getElementById("zzx-credits-modal");
          if (m && !m.hidden) closeModal(m);
        }
      });
    }
  }

  function bindFooterButton(modal) {
    const btn = document.getElementById("footer-credits-btn");
    if (!btn) {
      console.warn("[Credits] #footer-credits-btn not found. (No extra button will be created.)");
      return;
    }

    // Make sure it points at the modal
    btn.setAttribute("aria-controls", "zzx-credits-modal");
    btn.setAttribute("aria-haspopup", "dialog");

    if (btn.__zzxBound) return;
    btn.__zzxBound = true;

    btn.addEventListener("click", async () => {
      // If already open, close; else open
      if (isOpen(modal)) {
        closeModal(modal);
        return;
      }

      openModal(modal);
      await ensureCreditsContent(modal);
    });
  }

  // -----------------------------
  // BOOT
  // -----------------------------
  async function boot() {
    // 0) Kill the other credits UIs first (so nothing flickers/collapses)
    cleanupLegacyCreditsUIs();

    // 1) Ensure CSS is loaded (your footer.css patch styles the modal too, but this keeps existing credits styling safe)
    try {
      const prefix = getPrefix();
      const qsuf = cacheBustSuffix();
      const cssURL = join(prefix, `/__partials/credits/credits.css${qsuf}`);
      ensureCSSOnce("v-modal", cssURL);
    } catch (_) {}

    // 2) Ensure modal exists + bind controls
    const modal = ensureModal();
    bindModalControls(modal);

    // 3) Bind ONLY your correct footer button
    bindFooterButton(modal);

    // 4) Restore previous open state if desired
    if (readOpen()) {
      openModal(modal);
      await ensureCreditsContent(modal);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
