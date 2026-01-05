/* __partials/credits/credits.js */
/* Pure, defensive, zero-side-effects credits renderer */
/* Does NOT touch widgets, HUD, ticker, or global JS state */

/*
  DROP-IN FIX (for your new modal loader):
  - DO NOT append anything to the footer anymore (your footer has the Credits button).
  - Render INSIDE the modal body if present: #zzx-credits-body
  - Fallback render target: #zzx-credits (legacy panel) or [data-zzx-credits-panel]
  - If credits.html already populated the body, we DO NOTHING.
  - ESC/backdrop/X handling is owned by loader.js, not here.
*/

(function () {
  "use strict";

  // prevent double init
  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveMount() {
    // preferred: modal body created by loader.js
    const modalBody = document.getElementById("zzx-credits-body");
    if (modalBody) return modalBody;

    // legacy panel mounts
    const legacy =
      document.getElementById("zzx-credits") ||
      qs("[data-zzx-credits-panel]") ||
      qs("#credits") ||
      null;

    return legacy;
  }

  function hasRealContent(el) {
    if (!el) return false;

    // If loader fetched credits.html, the body will have non-empty markup.
    // Consider it "real" if it has any element children besides our own fallback wrapper.
    const kids = Array.from(el.children || []);
    if (!kids.length) return false;

    // If it already has a dedicated credits root, treat as populated.
    if (el.querySelector(".zzx-credits-modal, .zzx-credits-content, .zzx-credits__content")) return true;

    // If any child is not our fallback root, treat as populated
    const nonFallback = kids.some((k) => !k.classList.contains("zzx-credits"));
    return nonFallback;
  }

  function buildFallbackCredits() {
    const year = new Date().getFullYear();

    // NOTE: Keep this content conservative; your real credits should live in credits.html.
    // This is a safe fallback so the modal never opens "empty".
    const creators = [
      { name: "0xdeadbeef", role: "Founder / Builder", orgs: ["ZZX-Labs R&D", "0xdeadbeef Consulting", "BitTechIn"] }
    ];

    const oss = [
      // You can expand these in credits.html; this is only a baseline.
      { name: "Bitcoin", url: "https://bitcoin.org/" },
      { name: "Bitcoin Core", url: "https://bitcoincore.org/" },
      { name: "Lightning Network", url: "https://lightning.network/" },
      { name: "mempool.space", url: "https://mempool.space/" },
      { name: "Tor Project", url: "https://www.torproject.org/" },
      { name: "nginx", url: "https://nginx.org/" },
      { name: "Flask", url: "https://flask.palletsprojects.com/" },
      { name: "GNU/Linux", url: "https://www.gnu.org/" }
    ];

    const el = document.createElement("div");
    el.className = "zzx-credits";
    el.setAttribute("aria-label", "Site credits");

    el.innerHTML = `
      <div class="zzx-credits__content">

        <section class="zzx-credits__section" aria-label="Creators">
          <h3 class="zzx-credits__h">Creators</h3>
          <div class="zzx-credits__sub">
            © ${year} <strong>ZZX-Labs R&amp;D</strong>. All rights reserved. Licensed under the MIT License.
          </div>

          <div class="zzx-credits__list">
            ${creators
              .map((c) => {
                const orgs = (c.orgs || []).map(escapeHTML).join(" · ");
                return `
                  <div class="zzx-credits__row">
                    <div class="zzx-credits__name">${escapeHTML(c.name)}</div>
                    <div class="zzx-credits__meta">
                      <span class="zzx-credits__role">${escapeHTML(c.role || "")}</span>
                      ${orgs ? `<span class="zzx-credits__sep">·</span><span class="zzx-credits__orgs">${orgs}</span>` : ""}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>

        <hr class="zzx-credits__hr" />

        <section class="zzx-credits__section" aria-label="Open Source and Attributions">
          <h3 class="zzx-credits__h">Open Source &amp; Attributions</h3>
          <div class="zzx-credits__sub">
            We build on the shoulders of people who ship tools, publish research, and keep infrastructure free.
          </div>

          <ul class="zzx-credits__oss">
            ${oss
              .map((x) => {
                const name = escapeHTML(x.name || "");
                const url = String(x.url || "#");
                return `<li class="zzx-credits__ossItem"><a href="${url}" target="_blank" rel="noopener">${name}</a></li>`;
              })
              .join("")}
          </ul>

          <div class="zzx-credits__sub">
            If an attribution is missing or needs correction, please contact us and we will fix it promptly.
          </div>
        </section>

      </div>
    `;

    return el;
  }

  function ensureMinimalStyles(mount) {
    // If your credits.css didn’t load, keep the fallback readable.
    if (document.querySelector("style[data-zzx-credits-fallback='1']")) return;

    const st = document.createElement("style");
    st.setAttribute("data-zzx-credits-fallback", "1");
    st.textContent = `
.zzx-credits{ color:#c0d674; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
.zzx-credits__h{ margin:.25rem 0 .5rem 0; color:#e6a42b; font-size:1.05rem; }
.zzx-credits__sub{ color:#b7bf9a; font-size:.95rem; margin:0 0 .75rem 0; }
.zzx-credits__list{ display:grid; gap:.55rem; }
.zzx-credits__row{ padding:.55rem .65rem; border:1px solid rgba(255,255,255,.12); border-radius:10px; background: rgba(0,0,0,.18); }
.zzx-credits__name{ color:#e6a42b; font-weight:600; margin-bottom:.2rem; }
.zzx-credits__meta{ color:#b7bf9a; font-size:.95rem; display:flex; gap:.45rem; flex-wrap:wrap; align-items:baseline; }
.zzx-credits__hr{ border:0; border-top:1px solid rgba(255,255,255,.12); margin:1rem 0; }
.zzx-credits__oss{ margin:.35rem 0 0 1.2rem; padding:0; display:grid; gap:.35rem; }
.zzx-credits__ossItem a{ color:#c0d674; text-decoration:none; }
.zzx-credits__ossItem a:hover{ color:#e6a42b; text-decoration:underline; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function mount() {
    const mountEl = resolveMount();
    if (!mountEl) return;

    // If credits.html already provided content, do nothing.
    if (hasRealContent(mountEl)) return;

    // Avoid duplicates of our fallback
    if (mountEl.querySelector(".zzx-credits")) return;

    ensureMinimalStyles(mountEl);
    mountEl.innerHTML = ""; // keep deterministic
    mountEl.appendChild(buildFallbackCredits());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
