// /static/js/modules/ticker-loader.js
// ZZX Bitcoin HUD + Widget Orchestrator (AUTHORITATIVE) — DROP-IN REPLACEMENT
//
// Manifest-first:
// - ticker-loader injects ONLY the HUD wrapper (HTML+CSS)
// - then loads __partials/widgets/runtime.js
// - runtime.js is responsible for reading __partials/widgets/manifest.json and mounting widgets
//
// HARD FIXES (the ones that actually stop your current failures):
// - Waits for partials on WINDOW (correct emitter)
// - Prefix-safe URL joins (NEVER uses "." fallback; subpages cannot produce ../__partials/...)
// - CSS load is AWAITED before injecting wrapper HTML (prevents “raw HTML on left edge”)
// - Injects wrapper HTML and EXECUTES any <script> tags inside it (innerHTML won’t)
// - Idempotent CSS/JS loads
//
// IMPORTANT:
// - This file does NOT load individual widget.js files anymore.
// - If widgets are not mounting after this change, the bug is in __partials/widgets/runtime.js,
//   not in this loader.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ---------------------------------------------------------------------------
  // Prefix (single source)
  // ---------------------------------------------------------------------------
  function getPrefix() {
    // Highest priority: runtime-set prefix
    if (typeof W.ZZX?.PREFIX === "string" && W.ZZX.PREFIX.length) return W.ZZX.PREFIX;

    // GH Pages / subpath hint
    const htmlPrefix = D.documentElement?.getAttribute("data-zzx-prefix");
    if (htmlPrefix) return htmlPrefix;

    // CRITICAL: empty string means “domain root”.
    // DO NOT return "." (that causes ./__partials -> subdir-relative -> ../__partials failures).
    return "";
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);

    // absolute URL
    if (/^https?:\/\//i.test(s)) return s;

    // already relative; leave it alone (we only join absolute-paths here)
    if (!s.startsWith("/")) return s;

    // no prefix => domain root
    if (!prefix) return s;

    return String(prefix).replace(/\/+$/, "") + s;
  }

  const PREFIX = getPrefix();
  W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX });

  // ---------------------------------------------------------------------------
  // Assets (prefix-aware absolute paths)
  // ---------------------------------------------------------------------------
  const WIDGET_HTML = join(PREFIX, "/__partials/bitcoin-ticker-widget.html");
  const WIDGET_CSS  = join(PREFIX, "/__partials/bitcoin-ticker-widget.css");
  const RUNTIME_JS  = join(PREFIX, "/__partials/widgets/runtime.js");

  // Optional: publish canonical manifest URL for runtime.js
  W.__ZZX_WIDGETS_MANIFEST_URL = join(PREFIX, "/__partials/widgets/manifest.json");

  // ---------------------------------------------------------------------------
  // Idempotent loaders
  // ---------------------------------------------------------------------------
  function keyify(s) {
    // stable key safe for attribute selectors
    return btoa(unescape(encodeURIComponent(String(s)))).replace(/=+$/g, "");
  }

  function loadCSSOnce(href) {
    const key = "zzxcss:" + keyify(href);

    // If already present, treat as ready (we cannot reliably know load state; but it’s present)
    const existing = D.querySelector(`link[data-zzx-css="${key}"]`);
    if (existing) return Promise.resolve(true);

    // AWAIT CSS load to prevent “raw HTML unstyled at left edge”
    return new Promise((resolve) => {
      const l = D.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.setAttribute("data-zzx-css", key);
      l.onload = () => resolve(true);
      l.onerror = () => resolve(false); // non-fatal; we still mount so you SEE it fail
      D.head.appendChild(l);
    });
  }

  function loadJSOnce(src) {
    const key = "zzxjs:" + keyify(src);

    return new Promise((resolve) => {
      if (D.querySelector(`script[data-zzx-js="${key}"]`)) return resolve(true);
      const s = D.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      D.head.appendChild(s);
    });
  }

  async function fetchHTML(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTML fetch failed ${r.status}: ${url}`);
    return await r.text();
  }

  // ---------------------------------------------------------------------------
  // Inject HTML AND execute scripts contained in the fragment
  // (Needed because innerHTML does NOT execute <script> tags)
  // ---------------------------------------------------------------------------
  function injectHTMLExecuteScripts(mountEl, htmlText) {
    mountEl.replaceChildren();

    const tpl = D.createElement("template");
    tpl.innerHTML = htmlText;

    // Collect scripts (deep)
    const scripts = Array.from(tpl.content.querySelectorAll("script"));
    scripts.forEach((sc) => sc.remove());

    // Append non-script content
    mountEl.appendChild(tpl.content);

    // Recreate scripts so they execute in DOM insertion order
    for (const old of scripts) {
      const s = D.createElement("script");
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
      if (old.src) {
        // IMPORTANT: keep src as-is; if it’s absolute (/...), prefix is handled by the server.
        // If you ever use relative src inside the wrapper, convert it to absolute in the wrapper.
        s.src = old.src;
      } else {
        s.textContent = old.textContent || "";
      }
      mountEl.appendChild(s);
    }
  }

  // ---------------------------------------------------------------------------
  // Wait for partials-loader (window is the emitter)
  // ---------------------------------------------------------------------------
  function waitForPartials(timeoutMs = 3500) {
    if (W.__zzx_partials_ready) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(!!ok);
      };

      const onEvt = () => {
        W.__zzx_partials_ready = true;
        finish(true);
      };

      W.addEventListener("zzx:partials:ready", onEvt, { once: true });

      const t0 = performance.now();
      (function poll() {
        if (done) return;
        const h = D.getElementById("zzx-header");
        const f = D.getElementById("zzx-footer");
        if (h && h.childNodes.length && f && f.childNodes.length) return finish(true);
        if (performance.now() - t0 >= timeoutMs) return finish(false);
        setTimeout(poll, 60);
      })();
    });
  }

  // ---------------------------------------------------------------------------
  // Boot (strict order)
  // ---------------------------------------------------------------------------
  (async function boot() {
    try {
      await waitForPartials();

      const mount = D.getElementById("ticker-container");
      if (!mount) return;

      // 1) CSS first — and WAIT until it loads (prevents unstyled “raw” flashes)
      await loadCSSOnce(WIDGET_CSS);

      // 2) Inject wrapper HTML (AND execute its scripts)
      const html = await fetchHTML(WIDGET_HTML);
      injectHTMLExecuteScripts(mount, html);

      // 3) Load runtime orchestrator (manifest-driven)
      await loadJSOnce(RUNTIME_JS);

      // 4) runtime.js mounts from manifest; start registry (safe)
      try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}

    } catch (e) {
      console.error("[ZZX ticker-loader] fatal:", e);
    }
  })();
})();
