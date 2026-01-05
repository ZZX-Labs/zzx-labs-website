/* __partials/credits/credits.js */
/*
  ZZX Credits — SINGLE FILE CONTROLLER (DROP-IN REPLACEMENT)

  - Binds ONLY to: #footer-credits-btn
  - Uses the modal that lives in footer.html:
      #zzx-credits-modal
      #zzx-credits-dialog
      #zzx-credits-body
      .zzx-credits__close  (your footer)
    (Also tolerates older classnames: .zzx-credits-close / .zzx-credits-x)
  - Loads credits.html ONCE into #zzx-credits-body
  - Loads credits.css ONCE
  - Kills legacy credits UIs/links
  - No footer/page badges. No SVG. Unicode only.
*/

(function () {
  "use strict";

  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  const STATE_KEY = "zzx.credits.open";
  const CSS_KEY = "zzx-credits-css-loaded";

  /* -------------------- helpers -------------------- */

  const qs  = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));

  function getPrefix() {
    const p =
      window.ZZX?.PREFIX ||
      document.documentElement?.getAttribute("data-zzx-prefix") ||
      ".";
    return String(p || ".").replace(/\/+$/, "");
  }

  function join(prefix, path) {
    const s = String(path || "");
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
    if (prefix === "/") return s;
    return prefix.replace(/\/+$/, "") + s;
  }

  function ensureCSSOnce(href) {
    if (!href) return;
    // Prefer a stable marker over href equality (prefix / cachebust differences).
    if (document.querySelector(`link[data-${CSS_KEY}="1"]`)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(`data-${CSS_KEY}`, "1");
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
    // Remove any legacy injected credits blocks, but NEVER touch the modal's body content.
    qsa(".zzx-credits").forEach((el) => {
      if (!el.closest("#zzx-credits-modal")) el.remove();
    });

    // Remove legacy host wrappers/toggles from previous attempts
    qsa("[data-zzx-credits-host]").forEach((el) => el.remove());
    qsa("[data-zzx-credits-toggle]").forEach((el) => el.remove());

    // Remove old panel mount if it exists (and is not inside the modal)
    const old = document.getElementById("zzx-credits");
    if (old && !old.closest("#zzx-credits-modal")) old.remove();

    // Kill any stray "Credits" link/buttons outside the proper footer button.
    // This is what you described: white "Credits" href sitting bottom-left.
    qsa('a,button').forEach((n) => {
      // Keep the real footer button
      if (n.id === "footer-credits-btn") return;

      // Keep anything inside the modal
      if (n.closest("#zzx-credits-modal")) return;

      const tag = n.tagName.toLowerCase();

      if (tag === "a") {
        const href = (n.getAttribute("href") || "").toLowerCase();
        const text = (n.textContent || "").trim().toLowerCase();

        // Remove obvious legacy credits anchors
        if (
          href.includes("/__partials/credits/credits") ||
          href.endsWith("#credits") ||
          href.includes("/credits") ||
          text === "credits"
        ) {
          n.remove();
        }
      }

      if (tag === "button") {
        const text = (n.textContent || "").trim().toLowerCase();
        // Remove legacy credits buttons (but not footer-credits-btn above)
        if (text === "credits" || text.includes("credits")) {
          // Only if it looks like an extra credits control (avoid nuking unrelated UI)
          if (n.className && String(n.className).toLowerCase().includes("credits")) n.remove();
        }
      }
    });
  }

  /* ---------------- modal ---------------- */

  function ensureModal() {
    // Prefer footer-provided modal
    let modal = document.getElementById("zzx-credits-modal");
    if (modal) return modal;

    // Defensive fallback ONLY if footer modal is missing.
    modal = document.createElement("div");
    modal.id = "zzx-credits-modal";
    modal.hidden = true;
    modal.className = "zzx-credits-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Credits");

    modal.innerHTML = `
      <div id="zzx-credits-dialog" role="document">
        <div class="zzx-credits__head">
          <h2 class="zzx-credits__title" id="zzx-credits-title">Credits</h2>
          <button type="button" class="zzx-credits__close" aria-label="Close Credits">✕</button>
        </div>
        <div id="zzx-credits-body">
          <div class="zzx-credits-loading">Loading credits…</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function openModal(modal) {
    modal.hidden = false;
    document.documentElement.classList.add("zzx-modal-open");
    document.body.classList.add("zzx-modal-open");
    try { localStorage.setItem(STATE_KEY, "1"); } catch (_) {}
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.documentElement.classList.remove("zzx-modal-open");
    document.body.classList.remove("zzx-modal-open");
    try { localStorage.setItem(STATE_KEY, "0"); } catch (_) {}
  }

  /* ---------------- content ---------------- */

  async function loadCreditsOnce(modal) {
    const body = document.getElementById("zzx-credits-body") || qs("#zzx-credits-body", modal) || qs(".zzx-credits-body", modal);
    if (!body) return;
    if (body.dataset.zzxLoaded === "1") return;

    const prefix = getPrefix();
    const htmlURL = join(prefix, "/__partials/credits/credits.html");
    const cssURL  = join(prefix, "/__partials/credits/credits.css");
    ensureCSSOnce(cssURL);

    try {
      const r = await fetch(htmlURL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      body.innerHTML = await r.text();
      body.dataset.zzxLoaded = "1";
    } catch (e) {
      body.innerHTML = buildFallbackHTML();
      body.dataset.zzxLoaded = "1";
    }
  }

  function buildFallbackHTML() {
    const year = new Date().getFullYear();
    const items = [
      { name: "Bitcoin", url: "https://bitcoin.org" },
      { name: "Linux", url: "https://www.kernel.org" },
      { name: "Mozilla", url: "https://www.mozilla.org" },
      { name: "VideoLAN", url: "https://www.videolan.org" }
    ];

    return `
      <section class="zzx-credits notice" aria-label="Credits (fallback)">
        <h3>Credits</h3>
        <p>© ${year} <strong>ZZX-Labs R&amp;D</strong>. Licensed under the MIT License.</p>
        <ul>
          ${items.map(x => `<li><a href="${escapeHTML(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(x.name)}</a></li>`).join("")}
        </ul>
      </section>
    `;
  }

  /* ---------------- bindings ---------------- */

  function bind(modal) {
    const btn = document.getElementById("footer-credits-btn");
    if (!btn) return;

    // Make sure button never navigates (if someone accidentally changed it to <a>)
    btn.setAttribute("aria-controls", "zzx-credits-modal");
    btn.setAttribute("aria-haspopup", "dialog");

    if (!btn.__zzxBound) {
      btn.__zzxBound = true;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault?.();

        if (!modal.hidden) {
          closeModal(modal);
          return;
        }

        openModal(modal);
        await loadCreditsOnce(modal);
      });
    }

    // Close button (support both new + older classnames)
    const closeBtn =
      qs(".zzx-credits__close", modal) ||
      qs(".zzx-credits-close", modal) ||
      qs(".zzx-credits-x", modal);

    if (closeBtn && !closeBtn.__zzxBound) {
      closeBtn.__zzxBound = true;
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault?.();
        closeModal(modal);
      });
    }

    // Backdrop click closes (but not clicks inside dialog)
    if (!modal.__zzxBackdropBound) {
      modal.__zzxBackdropBound = true;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    }

    // ESC closes
    if (!window.__zzxCreditsEscBound) {
      window.__zzxCreditsEscBound = true;
      window.addEventListener("keydown", (e) => {
        if ((e.key === "Escape" || e.key === "Esc") && !modal.hidden) closeModal(modal);
      });
    }
  }

  /* ---------------- boot ---------------- */

  function boot() {
    cleanupLegacy();
    const modal = ensureModal();
    bind(modal);

    try {
      if (localStorage.getItem(STATE_KEY) === "1") {
        openModal(modal);
        loadCreditsOnce(modal);
      }
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
