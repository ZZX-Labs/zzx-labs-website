// /static/script.js
// Sitewide bootstrapper (partials + nav + ticker/HUD), SAFE on every page depth.
//
// Fixes the “header/nav/footer vanished on subpages” failure mode by:
// - Making the sitewide loader NON-FATAL (never hard-stops the page if a subfile 404s)
// - De-duping loads
// - Resolving /static reliably even when included as ../static/script.js
// - Waiting a beat for partials injection before calling autoInit (race hardening)

(function () {
  const W = window;

  // prevent double-boot
  if (W.__ZZX_STATIC_BOOTED) return;
  W.__ZZX_STATIC_BOOTED = true;

  function resolveBaseFromCurrentScript() {
    // Works with relative includes like ../static/script.js and absolute /static/script.js
    const s = document.currentScript;
    if (!s || !s.src) return "/static";
    try {
      const url = new URL(s.src, location.href);
      // strip filename
      url.pathname = url.pathname.replace(/\/[^/]*$/, "");
      // normalize: if it ends with "/static", good. Otherwise fall back.
      return url.pathname || "/static";
    } catch (_) {
      return "/static";
    }
  }

  // best-effort meta version passthrough
  function assetVersion() {
    const el = document.querySelector('meta[name="asset-version"]');
    const v = el ? (el.getAttribute("content") || "").trim() : "";
    return v;
  }

  function withBust(src) {
    const v = assetVersion();
    if (!v) return src;
    try {
      const u = new URL(src, location.href);
      if (!u.searchParams.has("v")) u.searchParams.set("v", v);
      return u.href;
    } catch (_) {
      return src;
    }
  }

  function alreadyLoaded(srcAbs) {
    return Array.from(document.scripts).some((s) => {
      try {
        return s.src && new URL(s.src, location.href).pathname === new URL(srcAbs, location.href).pathname;
      } catch (_) {
        return s.src === srcAbs;
      }
    });
  }

  function loadScript(src, { fatal = false } = {}) {
    const href = withBust(src);
    if (alreadyLoaded(href)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const el = document.createElement("script");
      el.src = href;
      el.defer = true;
      el.onload = () => resolve(true);
      el.onerror = () => {
        // NON-FATAL by default: do NOT break partials/nav on the whole site
        console.warn("[/static/script.js] failed to load:", href);
        if (fatal) resolve(false);
        else resolve(false);
      };
      document.head.appendChild(el);
    });
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function tryAutoInit(retries = 6, delayMs = 80) {
    for (let i = 0; i < retries; i++) {
      if (W.ZZXSite && typeof W.ZZXSite.autoInit === "function") {
        try { W.ZZXSite.autoInit(); } catch (e) { console.warn("[ZZXSite.autoInit] error:", e); }
        return true;
      }
      await wait(delayMs);
      delayMs = Math.min(400, Math.round(delayMs * 1.4));
    }
    return false;
  }

  async function boot() {
    const base = resolveBaseFromCurrentScript();      // usually "/static"
    const sitewide = `${base}/js/script.js`;          // "/static/js/script.js"

    // 1) Load the real sitewide logic (partials-loader, ticker-loader, etc.)
    await loadScript(sitewide, { fatal: false });

    // 2) Give partials-loader a moment to inject header/footer on slower pages
    // (prevents some race cases where autoInit runs before DOM is ready)
    await wait(0);

    // 3) Call autoInit (idempotent)
    await tryAutoInit();

    // Optional: also listen for partials-ready event (if your partials-loader emits it)
    // and run autoInit again (safe).
    if (!W.__ZZX_STATIC_PARTIALS_LISTENER) {
      W.__ZZX_STATIC_PARTIALS_LISTENER = true;
      W.addEventListener("zzx:partials-ready", () => {
        try { W.ZZXSite?.autoInit?.(); } catch (_) {}
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
