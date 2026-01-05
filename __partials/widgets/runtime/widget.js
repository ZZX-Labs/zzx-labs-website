/* /partials/widgets/runtime/widget.js */
/* DROP-IN, BACKWARD-COMPAT RUNTIME FOR ZZX HUD + WIDGETS
   Goals:
   - Fix broken relative paths across ANY subdir depth (no more ../partials/... 404s)
   - Keep existing DOM/layout intact (NO markup changes required)
   - Preserve existing global APIs if already present (only fill gaps)
   - Make failures visible (no infinite "loading..." with silent fetch errors)
   - Keep changes minimal and isolated to this runtime file
*/

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 0) Global namespace (preserve existing if present)
  // ---------------------------------------------------------------------------

  const W = window;

  // Keep these names because your other scripts already reference them.
  const Core = (W.ZZXWidgetsCore = W.ZZXWidgetsCore || {});
  const HUD  = (W.ZZXHUD         = W.ZZXHUD         || {});

  // ---------------------------------------------------------------------------
  // 1) Core helpers (non-breaking, additive)
  // ---------------------------------------------------------------------------

  // Query helpers (prefer existing Core impl if any)
  Core.qs  = Core.qs  || ((sel, scope) => (scope || document).querySelector(sel));
  Core.qsa = Core.qsa || ((sel, scope) => Array.from((scope || document).querySelectorAll(sel)));

  Core.on = Core.on || function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts || false);
  };

  Core.now = Core.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));

  // A tiny "ready" helper
  Core.ready = Core.ready || function ready(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      try { fn(); } catch (e) { /* no-op */ }
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  };

  // ---------------------------------------------------------------------------
  // 2) Base-path resolver (THE bug fix)
  // ---------------------------------------------------------------------------
  /*
    Your widgets were using relative paths like ../partials/widgets/...
    which break depending on where the page lives (subdirs/subsubdirs).

    This resolver yields an absolute "site root" base and a safe join().

    Priority order (lowest-risk, no content/layout changes):
    1) <meta name="zzx:base" content="/"> (optional)
    2) document.documentElement.getAttribute("data-zzx-base") (optional)
    3) window.ZZX_BASE (optional)
    4) infer root from location by walking up until it can see "/partials/" in URL space
       (we can’t probe filesystem here, so we infer by stripping path to origin).
  */

  function normalizeBasePath(p) {
    if (!p) return "/";
    p = String(p).trim();
    if (!p) return "/";
    // Allow full origin e.g. https://zzx-labs.io/
    try {
      const u = new URL(p, document.baseURI);
      // If they provided an origin+path, keep origin+path
      let out = u.origin + u.pathname;
      // Ensure trailing slash
      if (!out.endsWith("/")) out += "/";
      return out;
    } catch (_) {
      // Treat as path-only
      if (!p.startsWith("/")) p = "/" + p;
      if (!p.endsWith("/")) p += "/";
      return p;
    }
  }

  function getDeclaredBase() {
    // meta
    const meta = document.querySelector('meta[name="zzx:base"]');
    if (meta && meta.content) return meta.content;

    // html attribute
    const htmlBase = document.documentElement.getAttribute("data-zzx-base");
    if (htmlBase) return htmlBase;

    // global
    if (typeof W.ZZX_BASE === "string" && W.ZZX_BASE) return W.ZZX_BASE;

    return "";
  }

  function inferBaseFromLocation() {
    // Conservative inference: use origin + "/" only.
    // This prevents ../ path breakage everywhere with minimal assumptions.
    return window.location.origin + "/";
  }

  Core.base = Core.base || normalizeBasePath(getDeclaredBase() || inferBaseFromLocation());

  // Safe join for site assets: join("partials/widgets/x.json") => https://origin/partials/widgets/x.json
  Core.join = Core.join || function join(rel) {
    rel = String(rel || "");
    // If already absolute URL
    try {
      const u = new URL(rel);
      return u.href;
    } catch (_) {
      // continue
    }
    // If absolute-path
    if (rel.startsWith("/")) return window.location.origin + rel;
    // Else relative-to base
    return Core.base + rel.replace(/^\.\//, "");
  };

  // For older code still passing ../partials/... : normalize it to /partials/...
  Core.normalizeWidgetPath = Core.normalizeWidgetPath || function normalizeWidgetPath(p) {
    p = String(p || "");
    // Convert backtracking paths to absolute site-root equivalents.
    // Examples:
    //   ../partials/widgets/x.json  -> partials/widgets/x.json
    //   ../../partials/header.html  -> partials/header.html
    //   /partials/header.html       -> /partials/header.html (handled by join)
    const idx = p.indexOf("partials/");
    if (idx >= 0) return p.slice(idx); // strip any ../ prefix
    return p;
  };

  // ---------------------------------------------------------------------------
  // 3) Fetch utilities (timeouts + clear errors; no silent infinite loading)
  // ---------------------------------------------------------------------------

  function fetchWithTimeout(url, opts) {
    const timeoutMs = (opts && typeof opts.timeoutMs === "number") ? opts.timeoutMs : 12000;
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const signal = controller ? controller.signal : undefined;

    let timer = null;
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    const fetchOpts = Object.assign({}, opts || {});
    if (signal) fetchOpts.signal = signal;
    delete fetchOpts.timeoutMs;

    return fetch(url, fetchOpts).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  Core.fetchText = Core.fetchText || async function fetchText(relOrUrl, opts) {
    const rel = Core.normalizeWidgetPath(relOrUrl);
    const url = Core.join(rel);

    const r = await fetchWithTimeout(url, Object.assign({ cache: "no-store" }, opts || {}));
    if (!r.ok) {
      const msg = `HTTP ${r.status} ${r.statusText} for ${url}`;
      const err = new Error(msg);
      err.status = r.status;
      err.url = url;
      throw err;
    }
    return await r.text();
  };

  Core.fetchJSON = Core.fetchJSON || async function fetchJSON(relOrUrl, opts) {
    const txt = await Core.fetchText(relOrUrl, opts);
    try {
      return JSON.parse(txt);
    } catch (e) {
      const err = new Error(`Bad JSON from ${Core.join(Core.normalizeWidgetPath(relOrUrl))}`);
      err.cause = e;
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // 4) HUD state machine (Full / Ticker / Hide / Reset + handle)
  // ---------------------------------------------------------------------------

  const HUD_KEY = "zzx.hud.mode";

  function normalizeMode(m) {
    m = String(m || "").toLowerCase().trim();
    if (m === "full" || m === "ticker" || m === "hidden") return m;
    return "full";
  }

  HUD.normalize = HUD.normalize || normalizeMode;

  HUD.read = HUD.read || function read() {
    try {
      const v = localStorage.getItem(HUD_KEY);
      return normalizeMode(v || "full");
    } catch (_) {
      return "full";
    }
  };

  HUD.write = HUD.write || function write(mode) {
    const m = normalizeMode(mode);
    try { localStorage.setItem(HUD_KEY, m); } catch (_) { /* no-op */ }
    return m;
  };

  HUD.reset = HUD.reset || function reset() {
    try { localStorage.removeItem(HUD_KEY); } catch (_) { /* no-op */ }
    return "full";
  };

  function applyModeToDOM(mode) {
    const hudRoot = Core.qs("[data-hud-root]");
    const handle  = Core.qs("[data-hud-handle]");
    const label   = Core.qs("[data-runtime-mode]");

    if (hudRoot) hudRoot.setAttribute("data-hud-state", mode);

    // Handle should appear only when HUD is hidden (so user can re-open)
    if (handle) handle.style.display = (mode === "hidden") ? "flex" : "none";

    if (label) label.textContent = mode;
  }

  function setMode(mode) {
    const m = (typeof HUD.write === "function") ? HUD.write(mode) : normalizeMode(mode);
    applyModeToDOM(m);
    return m;
  }

  function resetMode() {
    const m = (typeof HUD.reset === "function") ? HUD.reset() : "full";
    applyModeToDOM(m);
    return m;
  }

  // ---------------------------------------------------------------------------
  // 5) HUD controls wiring (supports multiple possible attribute conventions)
  // ---------------------------------------------------------------------------

  function wireHUDControls() {
    // Accept any of these patterns without requiring markup edits:
    // - data-hud-btn="full|ticker|hide|reset"
    // - [data-hud-full], [data-hud-ticker], [data-hud-hide], [data-hud-reset]
    // - buttons with IDs: #hudFull #hudTicker #hudHide #hudReset (fallback)

    const btnFull   = Core.qs('[data-hud-btn="full"]')   || Core.qs("[data-hud-full]")   || Core.qs("#hudFull");
    const btnTicker = Core.qs('[data-hud-btn="ticker"]') || Core.qs("[data-hud-ticker]") || Core.qs("#hudTicker");
    const btnHide   = Core.qs('[data-hud-btn="hide"]')   || Core.qs("[data-hud-hide]")   || Core.qs("#hudHide");
    const btnReset  = Core.qs('[data-hud-btn="reset"]')  || Core.qs("[data-hud-reset]")  || Core.qs("#hudReset");

    Core.on(btnFull, "click", () => setMode("full"));
    Core.on(btnTicker, "click", () => setMode("ticker"));
    Core.on(btnHide, "click", () => setMode("hidden"));
    Core.on(btnReset, "click", () => resetMode());

    // Handle click should restore to ticker (least intrusive) unless you prefer full.
    const handle = Core.qs("[data-hud-handle]");
    Core.on(handle, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode("ticker");
    });

    // Apply persisted mode at startup
    applyModeToDOM(HUD.read());
  }

  // ---------------------------------------------------------------------------
  // 6) Widget bootstrapping (safe, minimal, backward compat)
  // ---------------------------------------------------------------------------

  function renderWidgetError(mountEl, title, err) {
    if (!mountEl) return;

    const safeTitle = title ? String(title) : "widget";
    const msg = (err && err.message) ? String(err.message) : "unknown error";

    // Do NOT change layout sizes; keep content inside the widget region.
    // We only replace innerHTML of the mount node.
    mountEl.innerHTML =
      '<div class="widget-error" style="padding:10px; color:#ffb86b; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace; font-size:12px; line-height:1.3; white-space:pre-wrap;">' +
        `[${safeTitle}] source unavailable\n${msg}` +
      "</div>";
  }

  async function hydrateMount(mountEl) {
    // Expected patterns (no markup edits required):
    // - data-zzx-widget="bitcoin-ticker" data-src="partials/widgets/bitcoin-ticker.html"
    // - data-widget="bitcoin-ticker" data-src="..."
    // - data-src on element alone
    // - data-json / data-html / data-script variants (optional)
    const name =
      mountEl.getAttribute("data-zzx-widget") ||
      mountEl.getAttribute("data-widget") ||
      mountEl.getAttribute("data-name") ||
      mountEl.id ||
      "widget";

    // Source may be HTML partial, or a JSON endpoint consumed by per-widget script.
    const src =
      mountEl.getAttribute("data-src") ||
      mountEl.getAttribute("data-html") ||
      mountEl.getAttribute("data-partial") ||
      "";

    if (!src) return; // nothing to do

    try {
      const html = await Core.fetchText(src);

      // Inject HTML only; do not auto-execute scripts here.
      // If the partial includes scripts, they must be loaded by the page or separate loader.
      mountEl.innerHTML = html;

      // Optional: if the injected partial expects a "mounted" event
      try {
        const ev = new CustomEvent("zzx:widget:mounted", { detail: { name } });
        mountEl.dispatchEvent(ev);
      } catch (_) { /* no-op */ }

    } catch (err) {
      renderWidgetError(mountEl, name, err);
    }
  }

  async function bootWidgets() {
    // Prefer an explicit root for widgets if present.
    const scope = Core.qs("[data-widgets-root]") || document;

    // Find mounts. These selectors are intentionally permissive for backward compat.
    const mounts = [
      ...Core.qsa("[data-zzx-widget][data-src]", scope),
      ...Core.qsa("[data-widget][data-src]", scope),
      ...Core.qsa("[data-src][data-widget-mount]", scope),
      ...Core.qsa("[data-src][data-zzx-mount]", scope),
    ];

    // De-dupe nodes
    const seen = new Set();
    const unique = mounts.filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    });

    // IMPORTANT: You want header/nav/footer to appear first, then widgets.
    // This file only manages widgets; but we can delay widget hydration a tick
    // so the page paints its main layout before we inject widget HTML.
    await new Promise((r) => setTimeout(r, 0));

    // Hydrate in DOM order (keeps ticker first if it appears first)
    for (const el of unique) {
      // eslint-disable-next-line no-await-in-loop
      await hydrateMount(el);
    }
  }

  // ---------------------------------------------------------------------------
  // 7) Startup
  // ---------------------------------------------------------------------------

  Core.ready(() => {
    // 1) Wire HUD controls
    wireHUDControls();

    // 2) Boot widget mounts (including bitcoin-ticker at top)
    //    If your site loads widgets differently on some pages, this is additive:
    //    it only touches elements with explicit data-src mounts.
    bootWidgets().catch((err) => {
      // If boot fails catastrophically, fail loud in console (do not alter layout)
      try { console.error("[ZZXWidgets] bootWidgets failed:", err); } catch (_) { /* no-op */ }
    });
  });

})();
