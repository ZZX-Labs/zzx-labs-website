// /static/js/modules/partials-loader.js
// ZZX Partials Loader — AUDITED & HARDENED
//
// RESPONSIBILITIES (ONLY):
// - Load header, nav, footer, credits partials
// - Work from ANY directory depth
// - Mount ONCE (idempotent)
// - Signal readiness so widgets/HUD wait correctly
//
// DOES NOT:
// - Touch layout styles
// - Modify partial HTML
// - Bind widgets or HUD
// - Change content

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Prevent double execution
  if (W.__zzx_partials_loaded) return;
  W.__zzx_partials_loaded = true;

  /* ------------------------------------------------------------------ */
  /* Base path resolution                                                */
  /* ------------------------------------------------------------------ */

  function resolveBase() {
    // Prefer canonical base set by site bootstrap
    if (typeof W.ZZX_BASE === "string" && W.ZZX_BASE) {
      return W.ZZX_BASE.replace(/\/+$/, "");
    }

    // Fallback: derive from this script src
    const s = D.currentScript;
    if (s && s.src) {
      const u = new URL(s.src, location.href);
      return u.origin;
    }

    return location.origin;
  }

  const BASE = resolveBase();

  const abs = (p) => {
    try {
      return new URL(p, BASE).href;
    } catch {
      return p;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Fetch helper (NO silent failure)                                   */
  /* ------------------------------------------------------------------ */

  async function fetchHTML(path) {
    const url = abs(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Partial fetch failed ${r.status}: ${url}`);
    return await r.text();
  }

  /* ------------------------------------------------------------------ */
  /* Mount helper                                                        */
  /* ------------------------------------------------------------------ */

  async function mountPartial({ id, selector, src }) {
    const host = D.querySelector(selector);
    if (!host) return false;

    // Already mounted?
    if (host.dataset.zzxMounted === "1") return true;

    const html = await fetchHTML(src);
    host.innerHTML = html;
    host.dataset.zzxMounted = "1";
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Load order (STRICT)                                                 */
  /* ------------------------------------------------------------------ */

  const PARTIALS = [
    {
      id: "header",
      selector: "#zzx-header",
      src: "/partials/header.html",
    },
    {
      id: "nav",
      selector: "#zzx-nav",
      src: "/partials/nav.html",
    },
    {
      id: "footer",
      selector: "#zzx-footer",
      src: "/partials/footer.html",
    },
    {
      id: "credits",
      selector: "#zzx-credits",
      src: "/partials/credits.html",
    },
  ];

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  (async function boot() {
    let mounted = 0;

    for (const p of PARTIALS) {
      try {
        const ok = await mountPartial(p);
        if (ok) mounted++;
      } catch (e) {
        console.warn(`[partials-loader] ${p.id} failed:`, e.message);
      }
    }

    // Signal readiness (CRITICAL for widgets & HUD)
    W.__zzx_partials_ready = true;
    D.dispatchEvent(new CustomEvent("zzx:partials:ready", {
      detail: { mounted }
    }));
  })();
})();
