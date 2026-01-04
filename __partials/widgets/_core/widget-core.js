// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (fixes the errors you pasted)
//
// Fixes:
// 1) window.ZZXWidgets undefined  -> provides window.ZZXWidgets.register(...)
// 2) window.ZZXWidgetRegistry undefined -> alias to same registry
// 3) Core.onMount is not a function -> provides Core.onMount(...)
// 4) Bad PREFIX causing ../__partials/... 404s on root -> clamps prefix on root pages
// 5) Makes ALL fetch("/...") prefix-aware (keeps widgets working without editing each widget)
//
// This file is intentionally "compat-first". It DOES NOT require changing each widget JS.

(function () {
  const W = window;

  // Prevent redefinition
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ---------------------------------------------------------
  // Prefix helpers
  // ---------------------------------------------------------
  function getPrefixRaw() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function clampPrefix(prefix) {
    // If you're on domain root ("/") but the cached prefix ended up like "..",
    // that produces "../__partials/..." and 404s. Clamp to "." in that case.
    const path = String(location.pathname || "/");
    const isRootish = (path === "/" || path.endsWith("/index.html"));
    if (isRootish && prefix.startsWith("..")) return ".";
    return prefix;
  }

  function getPrefix() {
    return clampPrefix(getPrefixRaw());
  }

  function isAbsSitePath(u) {
    return typeof u === "string" && u.startsWith("/") && !u.startsWith("//");
  }

  function join(prefix, path) {
    if (!path) return path;
    if (typeof path !== "string") return path;

    if (/^https?:\/\//i.test(path)) return path;

    // hosted at domain root
    if (prefix === "/") return path;

    // already relative
    if (!path.startsWith("/")) return path;

    // prefix + site-absolute path
    return prefix.replace(/\/+$/, "") + path;
  }

  // Public: prefix-safe absolute resolver for "/x/y"
  function abs(pathAbs) {
    return join(getPrefix(), pathAbs);
  }

  // ---------------------------------------------------------
  // Global fetch patch (so existing widgets keep working)
  // ---------------------------------------------------------
  function patchFetchOnce() {
    if (W.__ZZX_FETCH_PATCHED) return;
    W.__ZZX_FETCH_PATCHED = true;

    const nativeFetch = W.fetch.bind(W);

    W.fetch = function patchedFetch(input, init) {
      try {
        if (typeof input === "string") {
          if (isAbsSitePath(input)) input = abs(input);
        } else if (input && typeof input === "object" && "url" in input) {
          const url = String(input.url || "");
          if (isAbsSitePath(url)) {
            const fixed = abs(url);
            input = new Request(fixed, input);
          }
        }
      } catch (_) {
        // ignore; fall through
      }
      return nativeFetch(input, init);
    };
  }

  // ---------------------------------------------------------
  // Fetch helpers (used by some widgets)
  // ---------------------------------------------------------
  async function fetchText(url, opts = {}) {
    const u = (typeof url === "string") ? abs(url) : url;
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${typeof u === "string" ? u : "(request)"}`);
    return await r.text();
  }

  async function fetchJSON(url, opts = {}) {
    const u = (typeof url === "string") ? abs(url) : url;
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${typeof u === "string" ? u : "(request)"}`);
    return await r.json();
  }

  // ---------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // ---------------------------------------------------------
  // Assets (dedupe)
  // ---------------------------------------------------------
  function ensureCSS(href, key = "1") {
    const u = abs(href);
    const sel = `link[data-zzx-css="${key}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = u;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJS(src, key = "1") {
    const u = abs(src);
    const sel = `script[data-zzx-js="${key}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = u;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load script: ${u}`));
      document.body.appendChild(s);
    });
  }

  // ---------------------------------------------------------
  // Widget registry (WHAT YOUR WIDGETS EXPECT)
  // ---------------------------------------------------------
  // Many of your widget.js files do:
  //   window.ZZXWidgets.register("price-24h", (root, Core) => { ... })
  //
  // Others do:
  //   window.ZZXWidgetRegistry.register(...)
  //
  // Provide both.

  const _registry = new Map();       // id -> initFn
  const _booted = new Set();         // id -> boolean (init already invoked for a given root)

  function register(id, initFn) {
    if (!id || typeof initFn !== "function") return;
    _registry.set(String(id), initFn);

    // If the widget DOM already exists, init immediately.
    // Widget root marker we guarantee at mount time is: [data-widget-root="<id>"] OR [data-widget-id="<id>"]
    const root =
      document.querySelector(`[data-widget-root="${CSS.escape(String(id))}"]`) ||
      document.querySelector(`[data-widget-id="${CSS.escape(String(id))}"]`);

    if (root) safeInit(String(id), root);
  }

  function safeInit(id, root) {
    const key = `${id}@@${root && root.dataset ? (root.dataset.__zzx_uid || "") : ""}`;

    // give each root a stable uid once
    if (root && root.dataset && !root.dataset.__zzx_uid) {
      root.dataset.__zzx_uid = Math.random().toString(16).slice(2);
    }

    const uniq = `${id}@@${root && root.dataset ? root.dataset.__zzx_uid : ""}`;
    if (_booted.has(uniq)) return;

    const fn = _registry.get(id);
    if (typeof fn !== "function") return;

    try {
      _booted.add(uniq);
      fn(root, W.ZZXWidgetsCore);
    } catch (e) {
      console.warn(`[ZZXWidgets] init failed for ${id}:`, e);
    }
  }

  function initIfRegistered(id, root) {
    if (!id || !root) return;
    const fn = _registry.get(String(id));
    if (typeof fn === "function") safeInit(String(id), root);
  }

  function has(id) {
    return _registry.has(String(id));
  }

  // Global objects expected by widgets
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.has = has;

  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.has = has;

  // ---------------------------------------------------------
  // Core.onMount (WHAT SOME WIDGETS EXPECT)
  // ---------------------------------------------------------
  // Your errors show: "Core.onMount is not a function" in high-low-24h, tip, drift, btc-repo...
  // Implement a tolerant version that supports:
  //   Core.onMount(fn)                      // runs when DOM ready, passes { root } if found
  //   Core.onMount(widgetId, fn)            // runs when that widget root exists
  //   Core.onMount(widgetId, rootSel, fn)   // (extra compatibility) if they ever did this

  function onMount(a, b, c) {
    let widgetId = null;
    let fn = null;

    if (typeof a === "function") {
      fn = a;
    } else if (typeof a === "string" && typeof b === "function") {
      widgetId = a;
      fn = b;
    } else if (typeof a === "string" && typeof b === "string" && typeof c === "function") {
      widgetId = a;
      fn = c;
    }

    if (typeof fn !== "function") return;

    const run = () => {
      if (!widgetId) {
        try { fn(); } catch (e) { console.warn("[Core.onMount] callback failed:", e); }
        return;
      }

      // Find widget root (both markers supported)
      const root =
        document.querySelector(`[data-widget-root="${CSS.escape(widgetId)}"]`) ||
        document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`);

      if (root) {
        try { fn(root); } catch (e) { console.warn(`[Core.onMount] ${widgetId} callback failed:`, e); }
        return;
      }

      // Not mounted yet: observe briefly
      const mo = new MutationObserver(() => {
        const r2 =
          document.querySelector(`[data-widget-root="${CSS.escape(widgetId)}"]`) ||
          document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`);
        if (r2) {
          mo.disconnect();
          try { fn(r2); } catch (e) { console.warn(`[Core.onMount] ${widgetId} callback failed:`, e); }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });

      // Safety stop (don’t leak observers forever)
      setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, 5000);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      // next tick so widget HTML has a chance to land
      setTimeout(run, 0);
    }
  }

  // ---------------------------------------------------------
  // Mounting helpers (kept, but NOT required for your current runtime)
  // ---------------------------------------------------------
  function widgetBase(widgetId) {
    return `/__partials/widgets/${widgetId}`;
  }
  function hrefWidgetHTML(widgetId) {
    return abs(`${widgetBase(widgetId)}/widget.html`);
  }
  function hrefWidgetCSS(widgetId) {
    return abs(`${widgetBase(widgetId)}/widget.css`);
  }
  function hrefWidgetJS(widgetId) {
    return abs(`${widgetBase(widgetId)}/widget.js`);
  }
  function hrefWidgetData(widgetId, filename) {
    return abs(`${widgetBase(widgetId)}/${filename}`);
  }

  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    root.setAttribute("data-widget-root", widgetId); // compatibility
    return root;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderLoadFailed(slotEl, widgetId, err) {
    slotEl.innerHTML = "";
    const card = document.createElement("div");
    card.className = "btc-card";
    card.innerHTML =
      `<div class="btc-card__title">${escapeHTML(widgetId)}</div>` +
      `<div class="btc-card__value">widget load failed</div>` +
      `<div class="btc-card__sub">${escapeHTML(String(err && err.message ? err.message : err))}</div>`;
    slotEl.appendChild(card);
  }

  async function mountWidget(widgetId, slotEl, { force = false } = {}) {
    if (!slotEl) throw new Error(`No slot element for ${widgetId}`);

    if (!force && slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";
    slotEl.dataset.loading = "1";

    try {
      ensureCSS(hrefWidgetCSS(widgetId), `w:${widgetId}`);

      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;
      slotEl.replaceChildren(root);

      await ensureJS(hrefWidgetJS(widgetId), `w:${widgetId}`);

      // If the widget used register(), init now.
      initIfRegistered(widgetId, root);

      return true;
    } catch (err) {
      renderLoadFailed(slotEl, widgetId, err);
      return false;
    } finally {
      slotEl.dataset.loading = "0";
    }
  }

  async function mountAll(scope = document, { force = false } = {}) {
    const slots = qsa(".btc-slot[data-widget]", scope);
    const jobs = [];
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;
      jobs.push(mountWidget(id, slot, { force }));
    }
    return await Promise.allSettled(jobs);
  }

  // ---------------------------------------------------------
  // Publish core API
  // ---------------------------------------------------------
  patchFetchOnce();

  W.ZZXWidgetsCore = {
    __version: "1.2.0-dropin",
    // prefix/url
    getPrefix,
    join,
    abs,

    // fetch
    fetchText,
    fetchJSON,

    // dom
    qs,
    qsa,

    // assets
    ensureCSS,
    ensureJS,

    // compat hooks
    onMount,

    // mount helpers
    mountWidget,
    mountAll,

    // paths
    widgetBase,
    hrefWidgetHTML,
    hrefWidgetCSS,
    hrefWidgetJS,
    hrefWidgetData,
  };
})();
