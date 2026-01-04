// /script.js (homepage bootstrapper)
//
// 1) Load /static/script.js (partials + nav + ticker)
// 2) Load credits loader (idempotent, NON-FATAL)
// 3) Apply home-specific tweak (add scroll-animation to .hero)
//
// Hardening:
// - CSP nonce support via <meta name="csp-nonce" content="...">
// - Asset versioning via <meta name="asset-version" content="..."> (adds ?v=...)
// - Idempotent loader with normalized duplicate detection
// - Gentle retry/backoff for ZZXSite.autoInit()
//
// IMPORTANT FIX:
// - credits loader is NOT loaded as type="module" because your server currently serves
//   text/html for that path when missing/misrouted, which browsers block for modules.
// - credits loader failure must never break header/nav/footer injection.

(function () {
  const ABS = (u) => new URL(u, location.href).href;

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
    const u = new URL(src, location.href);
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

  // Try calling ZZXSite.autoInit a few times in case modules load slightly later
  async function tryAutoInit(retries = 4, delayMs = 120) {
    for (let i = 0; i < retries; i++) {
      if (window.ZZXSite && typeof window.ZZXSite.autoInit === "function") {
        try { window.ZZXSite.autoInit(); } catch {}
        return true;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(500, Math.round(delayMs * 1.5));
    }
    log("autoInit not found (ok if static only)");
    return false;
  }

  async function boot() {
    // 1) Sitewide (partials/nav/ticker). This must run first.
    const okSite = await load("/static/script.js", { fatal: true });
    if (!okSite) {
      // If /static/script.js fails, header/footer will be gone everywhere — report clearly.
      console.warn("[home-boot] /static/script.js failed; partials/nav will not inject.");
    }

    // Ensure init (idempotent)
    await tryAutoInit();

    // 2) Credits (NON-FATAL). Do NOT use type="module" here.
    // If this path is missing or serves HTML, it must NOT break the rest of the page.
    await load("/__partials/credits/loader.js", { fatal: false });

    // 3) Home-only nicety
    const hero = document.querySelector(".hero");
    if (hero) hero.classList.add("scroll-animation"); // picked up by global scroll FX
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot().catch(console.warn); }, { once: true });
  } else {
    boot().catch(console.warn);
  }
})();
