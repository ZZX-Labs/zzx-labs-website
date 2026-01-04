// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — DROP-IN REPLACEMENT
//
// Goals (compat + stability):
// 1) Restore legacy registry APIs used by many widget scripts:
//      - window.ZZXWidgets.register(id, initFn)
//      - window.ZZXWidgetRegistry.register(id, initFn)   (alias)
// 2) Restore Core helper used by other widgets:
//      - Core.onMount(fn) (and tolerant variants)
// 3) Auto-init widgets on register() when their DOM is already mounted.
// 4) Prefix-aware URL helpers + fetch helpers.
// 5) Provide minimal DOM helpers used across widget scripts.
//
// This file is intended to be the glue layer that fixes “containers show but data never loads”
// by preventing early-crash on missing globals/methods.

(function () {
  const W = window;

  // Avoid redefining if injected twice
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_core_v) return;

  // ---------------------------
  // Prefix + URL helpers
  // ---------------------------
  function getPrefix() {
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : ".";
    return (p && p.length) ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath;
    if (!absPath.startsWith("/")) return absPath;
    return prefix.replace(/\/+$/, "") + absPath;
  }

  function widgetBase(id) {
    return `/__partials/widgets/${id}`;
  }

  function hrefWidgetHTML(id) { return join(getPrefix(), `${widgetBase(id)}/widget.html`); }
  function hrefWidgetCSS(id)  { return join(getPrefix(), `${widgetBase(id)}/widget.css`); }
  function hrefWidgetJS(id)   { return join(getPrefix(), `${widgetBase(id)}/widget.js`); }

  // ---------------------------
  // Fetch helpers
  // ---------------------------
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

  // ---------------------------
  // DOM helpers
  // ---------------------------
  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function qsa(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }

  // Attempt to find the mounted DOM root for a widget id.
  // Supports multiple mounting styles used in the repo over time.
  function findWidgetRoot(id) {
    // Newer runtime.js path: slots are data-widget-slot="id"
    let el = document.querySelector(`[data-widget-slot="${id}"]`);
    if (el) return el;

    // Older wrapper: .btc-slot[data-widget="id"]
    el = document.querySelector(`.btc-slot[data-widget="${id}"]`);
    if (el) return el;

    // Some flows tagged slot itself with data-widget-id="id"
    el = document.querySelector(`[data-widget-id="${id}"]`);
    if (el) return el;

    // Some widgets may mark internal element with data-w="id"
    el = document.querySelector(`[data-w="${id}"]`);
    if (el) return el;

    return null;
  }

  // ---------------------------
  // Asset injectors (deduped)
  // ---------------------------
  function ensureCSSOnce(key, href) {
    const sel = `link[data-zzx-css="${key}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJSOnce(key, src) {
    const sel = `script[data-zzx-js="${key}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  // ---------------------------
  // onMount helper (compat)
  // ---------------------------
  // Supports:
  //   Core.onMount(fn)
  //   Core.onMount(widgetId, fn)   (tolerant)
  //   Core.onMount(fn, widgetId)   (tolerant)
  function onMount(a, b) {
    let fn = null;
    if (typeof a === "function") fn = a;
    else if (typeof b === "function") fn = b;

    if (!fn) return;

    const run = () => {
      try { fn(); } catch (e) { console.warn("[ZZXWidgetsCore] onMount handler error:", e); }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  // ---------------------------
  // Registry (legacy compat)
  // ---------------------------
  const _registry = new Map(); // id -> initFn
  const _inited = new Set();   // ids already initialized

  // Initialize a widget if we can find its DOM root.
  // We call initFn(root, Core) with best-effort compatibility.
  function tryInit(id) {
    const initFn = _registry.get(id);
    if (!initFn) return false;
    if (_inited.has(id)) return true;

    const root = findWidgetRoot(id);
    if (!root) return false;

    try {
      // Most compatible calling conventions:
      //  - (root, Core)
      //  - (Core)
      //  - ()
      if (initFn.length >= 2) initFn(root, W.ZZXWidgetsCore);
      else if (initFn.length === 1) initFn(W.ZZXWidgetsCore);
      else initFn();

      _inited.add(id);
      return true;
    } catch (e) {
      console.warn(`[ZZXWidgetsCore] init failed for ${id}:`, e);
      return false;
    }
  }

  // Public register API expected by existing widgets
  function register(id, initFn) {
    if (!id || typeof initFn !== "function") return false;
    id = String(id);
    _registry.set(id, initFn);

    // If DOM is already mounted (your runtime does HTML before JS), init now.
    // Otherwise init at DOMContentLoaded.
    if (!tryInit(id)) {
      onMount(() => tryInit(id));
    }
    return true;
  }

  // Allow runtime/devtools to force init/reinit
  function init(id) {
    if (!id) return false;
    return tryInit(String(id));
  }

  function resetInit(id) {
    if (!id) {
      _inited.clear();
      return true;
    }
    _inited.delete(String(id));
    return true;
  }

  // ---------------------------
  // Expose Core + legacy globals
  // ---------------------------
  W.ZZXWidgetsCore = {
    __zzx_core_v: "dropin-compat-1",

    // prefix/url
    getPrefix,
    join,
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

    // assets
    ensureCSSOnce,
    ensureJSOnce,

    // compat
    onMount,

    // registry
    register,
    init,
    resetInit,

    // debug
    _registry,
    _inited,
    _findWidgetRoot: findWidgetRoot,
  };

  // Legacy globals used by many widgets:
  //   window.ZZXWidgets.register("id", fn)
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.init = init;
  W.ZZXWidgets.resetInit = resetInit;

  // Some widgets do: window.ZZXWidgetRegistry.register(...)
  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.init = init;
  W.ZZXWidgetRegistry.resetInit = resetInit;

  // Optional alias for older scripts that referenced window.Core
  if (!W.Core) W.Core = W.ZZXWidgetsCore;
})();
