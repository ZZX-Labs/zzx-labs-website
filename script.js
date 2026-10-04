// /script.js (homepage bootstrapper)
//
// PURPOSE
// - Ensure header/nav/footer inject FIRST (via /static/script.js)
// - Ensure HUD + widgets can resolve paths from ANY subdirectory depth
// - Ensure bitcoin-ticker mounts cleanly at the top (centered container already in HTML)
// - Keep page layout/content unchanged (JS only)
// - Keep changes minimal + backward compatible
//
// NOTES
// - We do NOT assume /__partials/credits/loader.js exists or serves JS correctly.
//   It remains NON-FATAL.
// - We DO hard-fail loudly if /static/script.js fails, because without it your
//   header/nav/footer/widgets framework can’t initialize.
//
// Hardening features kept:
// - CSP nonce support via <meta name="csp-nonce" content="...">
// - Asset versioning via <meta name="asset-version" content="..."> (adds ?v=...)
// - Idempotent loader with normalized duplicate detection
// - Gentle retry/backoff for ZZXSite.autoInit()
//
// CRITICAL ADDITION
// - Unified base-path resolution (window.ZZX_BASE) using <base href="/"> or fallback
//   so widget/partial fetches never 404 due to ../ pathing.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Base path (site root) unification
  // ---------------------------------------------------------------------------
  // Prefer the document's <base href="..."> (your index.html already sets <base href="/"/>)
  // If missing, fall back to origin root. Keep it as an absolute URL for safe joins.
  function computeBase() {
    const baseEl = document.querySelector("base[href]");
    const href = baseEl ? (baseEl.getAttribute("href") || "").trim() : "";
    try {
      // If href is "/", this becomes "https://domain/"
      return new URL(href || "/", location.href).href.replace(/([^/])$/, "$1/");
    } catch {
      return location.origin + "/";
    }
  }

  // Export a single canonical base used by other scripts (non-breaking if already set)
  if (typeof window.ZZX_BASE !== "string" || !window.ZZX_BASE) {
    window.ZZX_BASE = computeBase();
  }

  // Helper: absolute URL resolver
  const ABS = (u) => new URL(u, window.ZZX_BASE || location.href).href;

  // read <meta> helpers (optional)
  const META = (name) => {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };
  const NONCE = META("csp-nonce");
  const VER = META("asset-version");

  const LOG = false; // flip true for debug
  const log = (...args) => { if (LOG) console.log("[home-boot]", ...args); };

  // Optional: treat URLs as duplicates even if only their query differs
  const SAME_URL_IGNORING_QUERY = true;

  function sameScript(a, b) {
    try {
      const A = new URL(a);
      const B = new URL(b);
      if (SAME_URL_IGNORING_QUERY) {
        return A.origin === B.origin && A.pathname === B.pathname;
      }
      return A.href === B.href;
    } catch {
      return a === b;
    }
  }

  function alreadyLoaded(srcAbs) {
    return Array.from(document.scripts).some((s) => s.src && sameScript(s.src, srcAbs));
  }

  function withBust(src) {
    if (!VER) return src;
    const u = new URL(src, window.ZZX_BASE || location.href);
    if (!u.searchParams.has("v")) u.searchParams.set("v", VER);
    return u.href;
  }

  function load(src, { attrs = {}, fatal = true } = {}) {
    const href = withBust(ABS(src));
    if (alreadyLoaded(href)) { log("skip (dup):", href); return Promise.resolve(true); }

    return new Promise((resolve) => {
      const el = document.createElement("script");
      el.src = href;
      el.defer = true; // classic script; safe order
      if (NONCE) el.setAttribute("nonce", NONCE);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);

      el.onload = () => { log("loaded:", href); resolve(true); };
      el.onerror = () => {
        const err = new Error("Failed to load " + href);
        if (fatal) {
          // resolve(false) so caller can decide; never hard-throw in the loader itself
          console.warn(err);
          resolve(false);
        } else {
          console.warn("[home-boot] non-fatal:", err.message);
          resolve(false);
        }
      };

      document.head.appendChild(el);
    });
  }

  // Try calling ZZXSite.autoInit a few times in case scripts load slightly later
  async function tryAutoInit(retries = 6, delayMs = 120) {
    for (let i = 0; i < retries; i++) {
      if (window.ZZXSite && typeof window.ZZXSite.autoInit === "function") {
        try { window.ZZXSite.autoInit(); } catch (e) { /* keep going */ }
        return true;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(700, Math.round(delayMs * 1.5));
    }
    log("autoInit not found (ok if static only)");
    return false;
  }

  async function boot() {
    // 1) Sitewide (partials/nav/ticker + shared utilities). This must run first.
    const okSite = await load("/static/script.js", { fatal: true });

    if (!okSite) {
      // If /static/script.js fails, header/footer will be gone everywhere — report clearly.
      console.warn("[home-boot] /static/script.js failed; header/nav/footer/widgets will not inject.");
      // Still attempt credits (non-fatal) so the page doesn't appear "dead" if it exists.
      await load("/__partials/credits/loader.js", { fatal: false });
      return;
    }

    // Ensure init (idempotent)
    await tryAutoInit();

    // 2) Credits (NON-FATAL). Do NOT use type="module" here.
    // If this path is missing or serves HTML, it must NOT break the rest of the page.
    await load("/__partials/credits/loader.js", { fatal: false });

    // 3) Home-only nicety (does not affect layout)
    const hero = document.querySelector(".hero");
    if (hero) hero.classList.add("scroll-animation"); // picked up by global scroll FX
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot().catch(console.warn); }, { once: true });
  } else {
    boot().catch(console.warn);
  }
})();
