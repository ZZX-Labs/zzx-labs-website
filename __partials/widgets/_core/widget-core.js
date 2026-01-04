// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT
//
// Fixes the “HTML loads but widget JS never loads data” failure by restoring the
// registry + lifecycle API that existing widget scripts expect:
//
// - window.ZZXWidgets.register(id, bootFn)
// - window.ZZXWidgetRegistry.register(id, bootFn)   (alias, also supports object-form)
// - Core.onMount(id, cb) and Core.onMount(cb)       (id inferred from currentScript.src)
// - Auto-runs bootFn as soon as the widget root exists (and re-runs on remount)
//
// This file does NOT require changing every widget.

(function () {
  const W = window;

  // ---------------------------------------------------------------------------
  // Prefix-aware URL helpers (used by some widgets)
  // ---------------------------------------------------------------------------
  function getPrefix() {
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : ".";
    return p && p.length ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath;
    if (!absPath.startsWith("/")) return absPath;
    return prefix.replace(/\/+$/, "") + absPath;
  }

  function widgetBase(widgetId) {
    return `/__partials/widgets/${widgetId}`;
  }

  function hrefWidgetHTML(widgetId) {
    return join(getPrefix(), `${widgetBase(widgetId)}/widget.html`);
  }
  function hrefWidgetCSS(widgetId) {
    return join(getPrefix(), `${widgetBase(widgetId)}/widget.css`);
  }
  function hrefWidgetJS(widgetId) {
    return join(getPrefix(), `${widgetBase(widgetId)}/widget.js`);
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------
  async function fetchText(url, opts = {}) {
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  function widgetRootById(id) {
    // runtime.js sets these; older widgets may rely on data-widget-root too
    return (
      document.querySelector(`[data-widget-id="${CSS.escape(id)}"]`) ||
      document.querySelector(`[data-widget-root="${CSS.escape(id)}"]`) ||
      null
    );
  }

  function inferWidgetIdFromCurrentScript() {
    const s = document.currentScript;
    const src = s && s.src ? String(s.src) : "";
    // Matches: /__partials/widgets/<id>/widget.js  (with any prefix before /__partials)
    const m = src.match(/\/__partials\/widgets\/([^\/]+)\/widget\.js(?:\?|#|$)/i);
    return m ? m[1] : null;
  }

  // ---------------------------------------------------------------------------
  // Asset injection (deduped)
  // ---------------------------------------------------------------------------
  function ensureCSS(href, key) {
    const attr = `data-zzx-css-${String(key).replace(/[^a-z0-9_-]/gi, "_")}`;
    if (document.querySelector(`link[${attr}="1"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const attr = `data-zzx-js-${String(key).replace(/[^a-z0-9_-]/gi, "_")}`;
    if (document.querySelector(`script[${attr}="1"]`)) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute(attr, "1");
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(s);
    });
  }

  // ---------------------------------------------------------------------------
  // Mount registry + lifecycle
  // ---------------------------------------------------------------------------
  const REG = new Map();          // id -> bootFn
  const PENDING = new Map();      // id -> Array<cb>
  let OBS = null;

  function safeCall(fn, id, root) {
    try {
      // Support common patterns:
      //  - bootFn(root, Core)
      //  - bootFn({ id, root, Core })
      //  - bootFn()
      if (fn.length >= 2) return fn(root, W.ZZXWidgetsCore);
      if (fn.length === 1) {
        // Ambiguous: could be (root) or ({root})
        // We pass an object to be safe; if they wanted root they can do arg.root.
        return fn({ id, root, Core: W.ZZXWidgetsCore });
      }
      return fn();
    } catch (e) {
      console.warn(`[ZZXWidgets] boot error for "${id}":`, e);
    }
  }

  function flushPendingFor(id) {
    const root = widgetRootById(id);
    if (!root) return;

    const list = PENDING.get(id);
    if (list && list.length) {
      PENDING.delete(id);
      for (const cb of list) {
        try { cb(root); } catch (e) { console.warn(`[ZZXWidgets] onMount cb error for "${id}":`, e); }
      }
    }

    const bootFn = REG.get(id);
    if (typeof bootFn === "function") safeCall(bootFn, id, root);
  }

  function ensureObserver() {
    if (OBS) return;
    OBS = new MutationObserver(() => {
      // Try to satisfy pending callbacks + auto-boot for any registered widgets
      for (const id of REG.keys()) flushPendingFor(id);
      for (const id of PENDING.keys()) flushPendingFor(id);
    });
    OBS.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Core.onMount:
  //  - Core.onMount("widget-id", (root)=>{ ... })
  //  - Core.onMount((root)=>{ ... })  // widget-id inferred from script URL
  function onMount(idOrCb, maybeCb) {
    let id = null;
    let cb = null;

    if (typeof idOrCb === "string") {
      id = idOrCb;
      cb = typeof maybeCb === "function" ? maybeCb : null;
    } else if (typeof idOrCb === "function") {
      cb = idOrCb;
      id = inferWidgetIdFromCurrentScript();
    }

    if (!id || !cb) return;

    const root = widgetRootById(id);
    if (root) {
      try { cb(root); } catch (e) { console.warn(`[ZZXWidgets] onMount cb error for "${id}":`, e); }
      return;
    }

    if (!PENDING.has(id)) PENDING.set(id, []);
    PENDING.get(id).push(cb);
    ensureObserver();
  }

  // ---------------------------------------------------------------------------
  // Public registries expected by existing widget scripts
  // ---------------------------------------------------------------------------
  function register(idOrObj, bootFnMaybe) {
    // Supports:
    //   register("id", fn)
    //   register({ id:"id", boot: fn })
    //   register({ id:"id", init: fn })
    let id = null;
    let fn = null;

    if (typeof idOrObj === "string") {
      id = idOrObj;
      fn = bootFnMaybe;
    } else if (idOrObj && typeof idOrObj === "object") {
      id = idOrObj.id || idOrObj.name;
      fn = idOrObj.boot || idOrObj.init || idOrObj.mount;
    }

    if (!id || typeof fn !== "function") return false;

    REG.set(id, fn);

    // If already mounted, boot immediately.
    flushPendingFor(id);

    // If not mounted yet, ensure observer so boot happens when it appears.
    ensureObserver();

    return true;
  }

  // ---------------------------------------------------------------------------
  // Export Core API (keep existing shape, add missing functions)
  // ---------------------------------------------------------------------------
  const Core = (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore === "object")
    ? W.ZZXWidgetsCore
    : {};

  Core.__version = Core.__version || "1.0.0-core-dropin";
  Core.getPrefix = getPrefix;
  Core.join = join;

  Core.fetchText = Core.fetchText || fetchText;
  Core.fetchJSON = Core.fetchJSON || fetchJSON;

  Core.qs = Core.qs || qs;
  Core.qsa = Core.qsa || qsa;

  Core.ensureCSS = Core.ensureCSS || ensureCSS;
  Core.ensureJS = Core.ensureJS || ensureJS;

  Core.widgetBase = Core.widgetBase || widgetBase;
  Core.hrefWidgetHTML = Core.hrefWidgetHTML || hrefWidgetHTML;
  Core.hrefWidgetCSS = Core.hrefWidgetCSS || hrefWidgetCSS;
  Core.hrefWidgetJS = Core.hrefWidgetJS || hrefWidgetJS;

  // The missing one your console complained about:
  Core.onMount = onMount;

  W.ZZXWidgetsCore = Core;

  // Registries expected by older widget JS:
  // Many of your widgets call window.ZZXWidgets.register(...)
  // Others call window.ZZXWidgetRegistry.register(...)
  if (!W.ZZXWidgets) {
    W.ZZXWidgets = { register };
  } else if (typeof W.ZZXWidgets.register !== "function") {
    W.ZZXWidgets.register = register;
  }

  if (!W.ZZXWidgetRegistry) {
    W.ZZXWidgetRegistry = { register };
  } else if (typeof W.ZZXWidgetRegistry.register !== "function") {
    W.ZZXWidgetRegistry.register = register;
  }

  // Optional: expose internals for debugging
  W.ZZXWidgetsCore.__registry = REG;
  W.ZZXWidgetsCore.__pending = PENDING;

  // Kick once in case widgets registered before this core loaded.
  // (If runtime loads widget.js earlier than core, this at least helps after reload.)
  queueMicrotask(() => {
    for (const id of REG.keys()) flushPendingFor(id);
  });
})();
