// __partials/credits/credits.js
// ZZX Credits — SINGLE CONTROLLER (no extra files)

(function () {
  "use strict";

  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  const STATE_KEY = "zzx.credits.open";

  const qs  = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));

  function getPrefix() {
    const p = window.ZZX?.PREFIX || document.documentElement?.getAttribute("data-zzx-prefix") || ".";
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
    if (document.querySelector('link[data-zzx-credits-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-credits-css", "1");
    document.head.appendChild(l);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function cleanupLegacy() {
    // remove old injected blocks/panels
    qsa(".zzx-credits").forEach(el => { if (!el.closest("#zzx-credits-modal")) el.remove(); });
    qsa("[data-zzx-credits-host]").forEach(el => el.remove());
    qsa("[data-zzx-credits-toggle]").forEach(el => el.remove());
    const oldPanel = document.getElementById("zzx-credits");
    if (oldPanel && !oldPanel.closest("#zzx-credits-modal")) oldPanel.remove();

    // remove stray “Credits” anchors INSIDE footer only (the white bottom-left link)
    qsa("footer a").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const text = (a.textContent || "").trim().toLowerCase();
      if (
        text === "credits" ||
        href.includes("/__partials/credits/credits") ||
        href.endsWith("#credits")
      ) {
        a.remove();
      }
    });
  }

  function ensureModal() {
    let modal = document.getElementById("zzx-credits-modal");
    if (modal) return modal;

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
    try { localStorage.setItem(STATE_KEY, "1"); } catch {}
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.documentElement.classList.remove("zzx-modal-open");
    document.body.classList.remove("zzx-modal-open");
    try { localStorage.setItem(STATE_KEY, "0"); } catch {}
  }

  async function loadCreditsOnce() {
    const body = document.getElementById("zzx-credits-body");
    if (!body || body.dataset.zzxLoaded === "1") return;

    const prefix = getPrefix();
    const cssURL  = join(prefix, "/__partials/credits/credits.css");
    ensureCSSOnce(cssURL);

    const shellURL = join(prefix, "/__partials/credits/credits.html");
    const creatorsURL = join(prefix, "/__partials/credits/creators.html");
    const attribURL   = join(prefix, "/__partials/credits/attributions.html");
    const thanksURL   = join(prefix, "/__partials/credits/thanks.html");

    try {
      // 1) Load shell (contains 3 slots)
      body.innerHTML = await fetchText(shellURL);

      // 2) Load 3 sections
      const [creatorsHTML, attribHTML, thanksHTML] = await Promise.all([
        fetchText(creatorsURL),
        fetchText(attribURL),
        fetchText(thanksURL),
      ]);

      const slotCreators = body.querySelector('[data-credits-slot="creators"]');
      const slotAttrib   = body.querySelector('[data-credits-slot="attributions"]');
      const slotThanks   = body.querySelector('[data-credits-slot="thanks"]');

      if (slotCreators) slotCreators.innerHTML = creatorsHTML;
      if (slotAttrib)   slotAttrib.innerHTML   = attribHTML;
      if (slotThanks)   slotThanks.innerHTML   = thanksHTML;

      body.dataset.zzxLoaded = "1";
    } catch (e) {
      body.innerHTML = `
        <section class="zzx-credits notice" aria-label="Credits (fallback)">
          <h3>Credits</h3>
          <p>Credits failed to load. Please try again.</p>
        </section>
      `;
      body.dataset.zzxLoaded = "1";
    }
  }

  function bind() {
    const btn = document.getElementById("footer-credits-btn");
    if (!btn) return;

    const modal = ensureModal();

    if (!btn.__zzxBound) {
      btn.__zzxBound = true;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        cleanupLegacy();

        if (!modal.hidden) return closeModal(modal);
        openModal(modal);
        await loadCreditsOnce();
      });
    }

    const closeBtn = qs(".zzx-credits__close", modal);
    if (closeBtn && !closeBtn.__zzxBound) {
      closeBtn.__zzxBound = true;
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        closeModal(modal);
      });
    }

    if (!modal.__zzxBackdropBound) {
      modal.__zzxBackdropBound = true;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    }

    if (!window.__zzxCreditsEscBound) {
      window.__zzxCreditsEscBound = true;
      window.addEventListener("keydown", (e) => {
        if ((e.key === "Escape" || e.key === "Esc") && !modal.hidden) closeModal(modal);
      });
    }

    // restore state
    try {
      if (localStorage.getItem(STATE_KEY) === "1") {
        openModal(modal);
        loadCreditsOnce();
      }
    } catch {}
  }

  function boot() {
    cleanupLegacy();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
