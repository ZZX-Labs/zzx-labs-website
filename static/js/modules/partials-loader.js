/* /partials-loader.js
   HARD FIX: restore header/nav/footer/credits/runtime on ALL subpages.

   Symptoms this fixes:
   - no header/nav/footer (relative paths broke on subpages)
   - credits floating/overlaying (credits injected into wrong place or before CSS)
   - HUD missing (runtime not loaded or widgets initialized before runtime exists)

   Contract:
   - Your HTML should include slots like:
       <div id="site-header"></div>
       <div id="site-nav"></div>
       <div id="site-footer"></div>
       <div id="site-credits"></div>
       <div id="site-runtime"></div>

     OR data-partial slots:
       <div data-partial="header"></div> etc.

   This loader:
   - Always tries ROOT absolute first (/) so it works from /about/ and deeper.
   - Falls back to relative paths only if root fetch fails.
   - Emits `zzx:partials:ready` when done.
*/

(function () {
  const CACHE = "no-store";

  // Map partial keys to preferred root paths
  const PARTIAL_PATHS = {
    header:  ["/partials/header.html",  "/__partials/header.html",  "/header.html"],
    nav:     ["/partials/nav.html",     "/__partials/nav.html",     "/nav.html"],
    footer:  ["/partials/footer.html",  "/__partials/footer.html",  "/footer.html"],
    credits: ["/partials/credits.html", "/__partials/credits.html", "/credits.html"],
    runtime: ["/partials/runtime.html", "/__partials/runtime.html", "/runtime.html"]
  };

  // Slot discovery: supports either #ids or data-partial attributes.
  function findSlot(key) {
    return (
      document.getElementById(`site-${key}`) ||
      document.querySelector(`[data-partial="${key}"]`) ||
      null
    );
  }

  async function tryFetch(url) {
    const r = await fetch(url, { cache: CACHE, credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  // Build a safe candidate list:
  // 1) absolute root paths (best for GitHub Pages + subdirectories)
  // 2) relative fallback from current document
  function buildCandidates(paths) {
    const rel = [];
    for (const p of paths) {
      // If already absolute, keep
      if (p.startsWith("/")) {
        // also try as-is
        rel.push(p);
      } else {
        rel.push(p);
      }

      // Also try relative variants for nested pages
      // e.g. ../../partials/header.html
      const depth = location.pathname.replace(/\/+$/, "").split("/").length - 1; // "/a/b/" -> 2
      for (let i = 0; i < Math.min(depth, 6); i++) {
        rel.push("../".repeat(i + 1) + p.replace(/^\/+/, ""));
      }
    }
    return unique(rel);
  }

  async function loadOne(key) {
    const slot = findSlot(key);
    if (!slot) return { key, ok: false, reason: "slot_missing" };

    const baseList = PARTIAL_PATHS[key] || [];
    const candidates = buildCandidates(baseList);

    for (const url of candidates) {
      try {
        const html = await tryFetch(url);
        slot.innerHTML = html;
        slot.setAttribute("data-partial-loaded", "1");
        slot.setAttribute("data-partial-source", url);
        return { key, ok: true, url };
      } catch (e) {
        // keep trying
      }
    }

    slot.setAttribute("data-partial-loaded", "0");
    return { key, ok: false, reason: "fetch_failed", candidates };
  }

  async function loadAll() {
    // Load in strict order: frame first, then credits, then runtime.
    // This prevents credits overlaying and runtime being missing when widgets mount.
    const results = [];
    results.push(await loadOne("header"));
    results.push(await loadOne("nav"));
    results.push(await loadOne("footer"));
    results.push(await loadOne("credits"));
    results.push(await loadOne("runtime"));

    // Signal readiness for widget-core/runtime to start mounting widgets/HUD.
    window.dispatchEvent(new CustomEvent("zzx:partials:ready", { detail: results }));

    // Also expose for debugging in console:
    window.ZZXPartials = window.ZZXPartials || {};
    window.ZZXPartials.lastResults = results;

    return results;
  }

  // Auto-run ASAP, but after DOM is ready enough to find slots
  function boot() {
    loadAll().catch(() => {
      // never hard-fail the page
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Export API
  window.ZZXPartials = window.ZZXPartials || {};
  window.ZZXPartials.loadAll = loadAll;
})();
