// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (single file)
//
// Purpose: restore the legacy APIs your existing widget scripts expect, WITHOUT
// forcing edits across 30+ widgets.
//
// Fixes console errors like:
//   - "window.ZZXWidgets is undefined"
//   - "window.ZZXWidgetRegistry is undefined"
//   - "Core.onMount is not a function"
//
// Also: keeps your current loader strategy compatible (root-relative paths),
// while still supporting an optional PREFIX if you ever need it.

(() => {
  const W = window;

  // avoid double-def
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_ok) return;

  // ----------------------------
  // URL helpers
  // ----------------------------

  // Root-relative is the safest for zzx-labs.io (domain root hosting).
  // If you ever need GH Pages subpath support again, you can set:
  //   window.ZZX = { PREFIX: "/some/subpath" }  (NO trailing slash required)
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string" && p.length) return p.replace(/\/+$/, "");
    return ""; // default: domain root
  }

  function join(prefix, absPathOrUrl) {
    if (!absPathOrUrl) return absPathOrUrl;
    const s = String(absPathOrUrl);

    // external
    if (/^https?:\/\//i.test(s)) return s;

    // already relative (e.g. "./x.js", "../x.js", "x.js")
    if (!s.startsWith("/")) return s;

    // if no prefix -> root-relative
    if (!prefix) return s;

    // prefix + absolute path
    return prefix + s;
  }

  function url(absPathOrUrl) {
    return join(getPrefix(), absPathOrUrl);
  }

  function widgetBase(widgetId) {
    return `/__partials/widgets/${widgetId}`;
  }

  function hrefWidgetHTML(widgetId) {
    return url(`${widgetBase(widgetId)}/widget.html`);
  }
  function hrefWidgetCSS(widgetId) {
    return url(`${widgetBase(widgetId)}/widget.css`);
  }
  function hrefWidgetJS(widgetId) {
    return url(`${widgetBase(widgetId)}/widget.js`);
  }

  // ----------------------------
  // Fetch helpers
  // ----------------------------
  async function fetchText(u, opts = {}) {
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.text();
  }

  async function fetchJSON(u, opts = {}) {
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.json();
  }

  // ----------------------------
  // DOM helpers
  // ----------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // Given a widget id, find the widget root reliably.
  // Supports both the old convention and your newer wrapper:
  //   - [data-widget-root="id"]
  //   - .zzx-widget[data-widget-id="id"]
  //   - [data-widget-slot="id"] > (first child)
  function getWidgetRoot(widgetId) {
    if (!widgetId) return null;

    let el =
      document.querySelector(`[data-widget-root="${widgetId}"]`) ||
      document.querySelector(`.zzx-widget[data-widget-id="${widgetId}"]`);

    if (el) return el;

    const slot = document.querySelector(`[data-widget-slot="${widgetId}"]`);
    if (slot) {
      // widget runtime mounts html into this slot; root might be firstElementChild
      return slot.querySelector(`[data-widget-root="${widgetId}"]`)
        || slot.querySelector(`.zzx-widget[data-widget-id="${widgetId}"]`)
        || slot.firstElementChild
        || slot;
    }

    // fallback: old slot style .btc-slot[data-widget="id"]
    const btcSlot = document.querySelector(`.btc-slot[data-widget="${widgetId}"]`);
    if (btcSlot) {
      return btcSlot.querySelector(`[data-widget-root="${widgetId}"]`)
        || btcSlot.querySelector(`.zzx-widget[data-widget-id="${widgetId}"]`)
        || btcSlot.firstElementChild
        || btcSlot;
    }

    return null;
  }

  // ----------------------------
  // Asset injectors (deduped)
  // ----------------------------
  function ensureCSS(href, key = href) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
    const sel = `link[data-zzx-css="${k}"]`;
    if (document.querySelector(sel)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    document.head.appendChild(l);
  }

  function ensureJS(src, key = src) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
    const sel = `script[data-zzx-js="${k}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", k);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  // ----------------------------
  // Legacy lifecycle shim: Core.onMount(...)
  // ----------------------------
  // Many of your widgets do:
  //   Core.onMount("tip", (root) => { ... })
  // or:
  //   Core.onMount(() => { ... })
  //
  // This implementation supports:
  //   - Core.onMount(widgetId, fn, {timeoutMs?})
  //   - Core.onMount(fn, {timeoutMs?})  // immediate when DOM ready
  function onMount(a, b, c) {
    let widgetId = null;
    let fn = null;
    let opts = null;

    if (typeof a === "function") {
      fn = a;
      opts = b || null;
    } else {
      widgetId = a;
      fn = b;
      opts = c || null;
    }

    if (typeof fn !== "function") return;

    const timeoutMs = Number(opts?.timeoutMs ?? 5000);

    function ready(cb) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => cb(), { once: true });
      } else cb();
    }

    ready(() => {
      const t0 = performance.now();

      const tick = () => {
        const root = widgetId ? getWidgetRoot(widgetId) : null;

        // If widgetId not provided, just run once when DOM is ready.
        if (!widgetId) {
          try { fn(null, W.ZZXWidgetsCore); } catch (_) {}
          return;
        }

        if (root) {
          try { fn(root, W.ZZXWidgetsCore); } catch (_) {}
          return;
        }

        if (performance.now() - t0 >= timeoutMs) {
          // give up silently (prevents console spam)
          return;
        }

        requestAnimationFrame(tick);
      };

      tick();
    });
  }

  // ----------------------------
  // Legacy registries: window.__ZZX_WIDGETS, window.ZZXWidgets, window.ZZXWidgetRegistry
  // ----------------------------

  // Your widgets throw when they try:
  //   window.ZZXWidgets.register("price-24h", { boot(){...} })
  //
  // This registry:
  // - stores handlers
  // - can be started (boot all) once runtime mounted
  // - can boot individual widgets safely

  const _registry = new Map();
  let _started = false;

  function normalizeId(id) {
    return String(id || "").trim();
  }

  function register(id, def) {
    const wid = normalizeId(id);
    if (!wid) return false;

    // support "register({id:'x', boot(){}})"
    if (def && typeof def === "object" && !def.boot && def.id && typeof def.id === "string") {
      def = def;
    }

    _registry.set(wid, def || {});
    return true;
  }

  function bootOne(id) {
    const wid = normalizeId(id);
    const def = _registry.get(wid);
    if (!def) return false;

    // find root
    const root = getWidgetRoot(wid);

    // Several patterns exist in your widgets:
    //  - def.boot(root, Core)
    //  - def.init(root, Core)
    //  - def.start(root, Core)
    //  - def(root, Core) if def itself is a function
    try {
      if (typeof def === "function") {
        def(root, W.ZZXWidgetsCore);
        return true;
      }
      if (typeof def.boot === "function") {
        def.boot(root, W.ZZXWidgetsCore);
        return true;
      }
      if (typeof def.init === "function") {
        def.init(root, W.ZZXWidgetsCore);
        return true;
      }
      if (typeof def.start === "function") {
        def.start(root, W.ZZXWidgetsCore);
        return true;
      }
    } catch (_) {
      // swallow—widget should render its own "bootloading…" etc
    }
    return true;
  }

  function start() {
    _started = true;
    for (const id of _registry.keys()) bootOne(id);
    return true;
  }

  // Expose in all names your current widgets reference
  W.__ZZX_WIDGETS = W.__ZZX_WIDGETS || {};
  W.__ZZX_WIDGETS.register = W.__ZZX_WIDGETS.register || register;
  W.__ZZX_WIDGETS.start = W.__ZZX_WIDGETS.start || start;
  W.__ZZX_WIDGETS.bootOne = W.__ZZX_WIDGETS.bootOne || bootOne;

  // Some widgets use window.ZZXWidgets.register(...)
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = W.ZZXWidgets.register || register;
  W.ZZXWidgets.start = W.ZZXWidgets.start || start;

  // Some widgets use window.ZZXWidgetRegistry.register(...)
  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = W.ZZXWidgetRegistry.register || register;
  W.ZZXWidgetRegistry.start = W.ZZXWidgetRegistry.start || start;

  // ----------------------------
  // Public Core API (used by widgets)
  // ----------------------------
  W.ZZXWidgetsCore = {
    __zzx_ok: true,
    __version: "legacy-shim-1.0.0",

    // url helpers
    getPrefix,
    join,
    url,
    widgetBase,
    hrefWidgetHTML,
    hrefWidgetCSS,
    hrefWidgetJS,

    // fetch
    fetchText,
    fetchJSON,

    // dom
    qs,
    qsa,
    getWidgetRoot,

    // assets
    ensureCSS,
    ensureJS,

    // lifecycle shim
    onMount,

    // registry access (optional)
    register,
    start,
    bootOne,
  };

  // If runtime already injected widgets and some widget scripts already registered,
  // auto-start on DOM ready so data begins flowing without manual calls.
  // (Safe: start() is idempotent.)
  function autoStartIfNeeded() {
    if (_started) return;
    // Only autostart if *something* is registered.
    if (_registry.size === 0) return;
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoStartIfNeeded, { once: true });
  } else {
    autoStartIfNeeded();
  }
})();
