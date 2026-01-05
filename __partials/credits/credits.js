/* __partials/credits/credits.js */
/*
  ZZX Credits — SINGLE FILE CONTROLLER

  RESPONSIBILITIES (AND ONLY THESE):
  - Bind to the EXISTING footer button: #footer-credits-btn
  - Create ONE modal (if not already present)
  - Open / close modal via:
      • footer button click
      • ✕ button
      • ESC key
      • backdrop click
  - Load credits.html ONCE into the modal body
  - Load credits.css ONCE
  - Provide a safe fallback renderer if credits.html fails
  - REMOVE / PREVENT any legacy credits UI from existing
  - NEVER append anything to the footer or page body as a badge
  - NO SVG, NO icons beyond Unicode characters
*/

(function () {
  "use strict";

  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  const STATE_KEY = "zzx.credits.open";

  /* -------------------- helpers -------------------- */

  const qs  = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));

  function getPrefix() {
    const p =
      window.ZZX?.PREFIX ||
      document.documentElement?.getAttribute("data-zzx-prefix") ||
      ".";
    return p.replace(/\/+$/, "");
  }

  function join(prefix, path) {
    if (/^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix === "/" ? path : prefix + path;
  }

  function ensureCSSOnce(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------------- legacy cleanup ---------------- */

  function cleanupLegacy() {
    qsa(".zzx-credits").forEach(el => el.remove());
    qsa("[data-zzx-credits-host]").forEach(el => el.remove());
    qsa("[data-zzx-credits-toggle]").forEach(el => el.remove());

    const old = document.getElementById("zzx-credits");
    if (old) old.remove();
  }

  /* ---------------- modal ---------------- */

  function ensureModal() {
    let modal = document.getElementById("zzx-credits-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "zzx-credits-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Credits");

    modal.innerHTML = `
      <div class="zzx-credits-dialog">
        <div class="zzx-credits-head">
          <h2>Credits</h2>
          <button class="zzx-credits-close" aria-label="Close">✕</button>
        </div>
        <div class="zzx-credits-body">
          <div class="zzx-credits-loading">Loading…</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function openModal(modal) {
    modal.hidden = false;
    document.body.classList.add("zzx-modal-open");
    try { localStorage.setItem(STATE_KEY, "1"); } catch {}
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.body.classList.remove("zzx-modal-open");
    try { localStorage.setItem(STATE_KEY, "0"); } catch {}
  }

  /* ---------------- content ---------------- */

  async function loadCredits(modal) {
    const body = qs(".zzx-credits-body", modal);
    if (!body || body.dataset.loaded) return;

    const prefix = getPrefix();
    const htmlURL = join(prefix, "/__partials/credits/credits.html");
    const cssURL  = join(prefix, "/__partials/credits/credits.css");

    ensureCSSOnce(cssURL);

    try {
      const r = await fetch(htmlURL, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      body.innerHTML = await r.text();
      body.dataset.loaded = "1";
      return;
    } catch {
      body.innerHTML = buildFallbackHTML();
      body.dataset.loaded = "1";
    }
  }

  function buildFallbackHTML() {
    const year = new Date().getFullYear();
    return `
      <div class="zzx-credits">
        <h3>Credits</h3>
        <p>© ${year} ZZX-Labs R&amp;D. MIT Licensed.</p>
        <ul>
          <li><a href="https://bitcoin.org" target="_blank" rel="noopener">Bitcoin</a></li>
          <li><a href="https://www.kernel.org" target="_blank" rel="noopener">Linux</a></li>
          <li><a href="https://www.mozilla.org" target="_blank" rel="noopener">Mozilla</a></li>
          <li><a href="https://www.videolan.org" target="_blank" rel="noopener">VideoLAN</a></li>
        </ul>
      </div>
    `;
  }

  /* ---------------- bindings ---------------- */

  function bind(modal) {
    const btn = document.getElementById("footer-credits-btn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!modal.hidden) {
        closeModal(modal);
        return;
      }
      openModal(modal);
      await loadCredits(modal);
    });

    qs(".zzx-credits-close", modal)
      .addEventListener("click", () => closeModal(modal));

    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal(modal);
    });

    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && !modal.hidden) closeModal(modal);
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    cleanupLegacy();
    const modal = ensureModal();
    bind(modal);

    try {
      if (localStorage.getItem(STATE_KEY) === "1") {
        openModal(modal);
        loadCredits(modal);
      }
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
