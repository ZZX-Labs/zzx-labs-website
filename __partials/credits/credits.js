/* __partials/credits/credits.js */
/*
  ZZX Credits — SINGLE FILE CONTROLLER (DROP-IN REPLACEMENT)

  - Binds ONLY to: #footer-credits-btn
  - Uses modal already present in footer.html:
      #zzx-credits-modal
      #zzx-credits-body
      .zzx-credits__close  (also tolerates .zzx-credits-close / .zzx-credits-x)
  - Loads credits.html ONCE into #zzx-credits-body
  - Loads credits.css ONCE
  - Kills legacy credits UIs/links WITHOUT touching modal content
  - No footer/page badges. No SVG. Unicode only.
*/

(function () {
  "use strict";

  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  const STATE_KEY = "zzx.credits.open";
  const CSS_MARK  = "zzx-credits-css";

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
    if (!prefix || prefix === "/") return s;
    return prefix + s;
  }

  function ensureCSSOnce(href) {
    if (!href) return;
    if (document.querySelector(`link[data-${CSS_MARK}="1"]`)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(`data-${CSS_MARK}`, "1");
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

  function isInsideCreditsModal(node) {
    return !!(node && node.closest && node.closest("#zzx-credits-modal"));
  }
  function isInsideCreditsBody(node) {
    return !!(node && node.closest && node.closest("#zzx-credits-body"));
  }

  function cleanupLegacy() {
    // Remove legacy injected credits blocks OUTSIDE the modal/body only
    qsa(".zzx-credits").forEach((el) => {
      if (!isInsideCreditsModal(el) && !isInsideCreditsBody(el)) el.remove();
    });

    // Remove legacy host wrappers/toggles (older attempts)
    qsa("[data-zzx-credits-host]").forEach((el) => {
      if (!isInsideCreditsModal(el) && !isInsideCreditsBody(el)) el.remove();
    });
    qsa("[data-zzx-credits-toggle]").forEach((el) => {
      if (!isInsideCreditsModal(el) && !isInsideCreditsBody(el)) el.remove();
    });

    // Remove old inline panel mount used for collapsing behavior
    const oldPanel = document.getElementById("zzx-credits");
    if (oldPanel && !isInsideCreditsModal(oldPanel) && !isInsideCreditsBody(oldPanel)) {
      oldPanel.remove();
    }

    // Remove ONLY anchors that directly point to the credits partial (the white link culprit)
    qsa('a[href]').forEach((a) => {
      if (isInsideCreditsModal(a) || isInsideCreditsBody(a)) return;

      const href = (a.getAttribute("href") || "").trim();
      if (!href) return;

      // Kill the specific direct-to-partial link (absolute or relative)
      if (
        href.includes("/__partials/credits/credits.html") ||
        href.endsWith("__partials/credits/credits.html") ||
        href.endsWith("/credits.html")
      ) {
        a.remove();
      }
    });
  }

  /* ---------------- modal ---------------- */

  function ensureModal() {
    // MUST exist in footer.html for your chosen architecture
    const modal = document.getElementById("zzx-credits-modal");
    return modal || null;
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
    const body = document.getElementById("zzx-credits-body");
    if (!body) return;

    // already loaded
    if (body.dataset.zzxLoaded === "1") return;

    const prefix = getPrefix();
    const htmlURL = join(prefix, "/__partials/credits/credits.html");
    const cssURL  = join(prefix, "/__partials/credits/credits.css");
    ensureCSSOnce(cssURL);

    try {
      const r = await fetch(htmlURL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);

      const html = await r.text();
      body.innerHTML = html;
      body.dataset.zzxLoaded = "1";
    } catch (_) {
      body.innerHTML = buildFallbackHTML();
      body.dataset.zzxLoaded = "1";
    }
  }

  function buildFallbackHTML() {
    const year = new Date().getFullYear();
    const items = [
      { name: "Bitcoin",   url: "https://bitcoin.org" },
      { name: "Linux",     url: "https://www.kernel.org" },
      { name: "Mozilla",   url: "https://www.mozilla.org" },
      { name: "VideoLAN",  url: "https://www.videolan.org" }
    ];

    return `
      <section class="zzx-credits notice" aria-label="Credits (fallback)">
        <h3>Credits</h3>
        <p>© ${year} <strong>ZZX-Labs R&amp;D</strong>. Licensed under the MIT License.</p>
        <ul>
          ${items.map(x =>
            `<li><a href="${escapeHTML(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(x.name)}</a></li>`
          ).join("")}
        </ul>
      </section>
    `;
  }

  /* ---------------- bindings ---------------- */

  function bind(modal) {
    const btn = document.getElementById("footer-credits-btn");
    if (!btn) return;

    btn.setAttribute("aria-controls", "zzx-credits-modal");
    btn.setAttribute("aria-haspopup", "dialog");

    if (!btn.__zzxBoundCredits) {
      btn.__zzxBoundCredits = true;
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

    // Close button (support multiple classnames)
    const closeBtn =
      qs(".zzx-credits__close", modal) ||
      qs(".zzx-credits-close", modal) ||
      qs(".zzx-credits-x", modal);

    if (closeBtn && !closeBtn.__zzxBoundCredits) {
      closeBtn.__zzxBoundCredits = true;
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault?.();
        closeModal(modal);
      });
    }

    // Backdrop click closes (only when clicking the overlay itself)
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
    if (!modal) {
      console.warn("[Credits] #zzx-credits-modal not found in footer.html");
      return;
    }

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
