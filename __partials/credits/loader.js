// __partials/credits/loader.js
// ZZX Credits Loader (ES module-safe)
// Purpose:
// - Fix the "disallowed MIME type (text/html)" error by existing at the exact path requested.
// - Mount credits UI into a host element without breaking pages that don't have one.
// - Prefix-aware (works from any depth if window.ZZX.PREFIX is set by partials-loader.js).
//
// Expected optional assets (you can add later; loader tolerates missing):
//   /__partials/credits/credits.html
//   /__partials/credits/credits.css
//
// Expected optional mount targets (any one is enough):
//   <div id="zzx-credits"></div>
//   <div id="credits-container"></div>
//   <div data-zzx-credits-mount></div>

(() => {
  const W = window;

  // Avoid double boot if imported multiple times
  if (W.__ZZX_CREDITS_LOADER_BOOTED) return;
  W.__ZZX_CREDITS_LOADER_BOOTED = true;

  // ---------------- prefix-aware helpers ----------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath;          // hosted at domain root
    if (!absPath.startsWith("/")) return absPath; // already relative
    return prefix.replace(/\/+$/, "") + absPath;
  }

  function hrefs() {
    const prefix = getPrefix();
    return {
      HTML: join(prefix, "/__partials/credits/credits.html"),
      CSS:  join(prefix, "/__partials/credits/credits.css"),
    };
  }

  // ---------------- DOM helpers ----------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function findMount() {
    return (
      qs("#zzx-credits") ||
      qs("#credits-container") ||
      qs("[data-zzx-credits-mount]")
    );
  }

  function ensureCSS(href) {
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

  function emitReady(detail) {
    try {
      W.dispatchEvent(new CustomEvent("zzx:credits-ready", { detail }));
    } catch (_) {}
  }

  // ---------------- boot ----------------
  async function boot() {
    const mount = findMount();
    if (!mount) {
      // No mount on this page; silently do nothing.
      emitReady({ mounted: false, reason: "no-mount" });
      return;
    }

    // Prevent reinjection spam
    if (mount.dataset.zzxCreditsLoaded === "1") {
      emitReady({ mounted: true, cached: true });
      return;
    }

    const { HTML, CSS } = hrefs();

    // CSS is optional; if missing, non-fatal.
    ensureCSS(CSS);

    try {
      const html = await fetchText(HTML);
      mount.innerHTML = html;
      mount.dataset.zzxCreditsLoaded = "1";
      emitReady({ mounted: true, cached: false });
    } catch (e) {
      // If credits.html doesn't exist yet, fail gracefully with a minimal stub.
      mount.innerHTML = `
        <div class="btc-card" data-zzx-credits-fallback="1">
          <div class="btc-card__title">Credits</div>
          <div class="btc-card__value">unavailable</div>
          <div class="btc-card__sub">${String(e?.message || e)}</div>
        </div>
      `;
      mount.dataset.zzxCreditsLoaded = "1";
      emitReady({ mounted: true, error: String(e?.message || e) });
    }
  }

  // Expose for manual reboots/debug
  W.ZZXCreditsLoader = { boot };

  // Boot now; also re-boot after partials loader announces prefix readiness
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // If prefix becomes available later (partials injected after this module loads), retry once.
  W.addEventListener(
    "zzx:partials-ready",
    () => {
      const mount = findMount();
      if (mount && mount.dataset.zzxCreditsLoaded !== "1") boot();
    },
    { once: true }
  );
})();
