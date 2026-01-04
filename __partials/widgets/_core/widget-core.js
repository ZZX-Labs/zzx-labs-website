// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (compat-first)
//
// Fixes the current breakage where widget scripts expect:
//   - window.ZZXWidgets.register(...)
//   - window.ZZXWidgetRegistry.register(...)
//   - Core.onMount(...)
// …but those APIs are missing, so widgets crash before they fetch/render data.
//
// Design goals:
//   1) Do NOT require editing every widget.
//   2) Works whether a widget registers BEFORE or AFTER its DOM is mounted.
//   3) Works from any depth (prefix-aware via window.ZZX.PREFIX when available).
//   4) Keeps your existing Core-style helpers (qs/qsa/fetchJSON/etc).
//
// This file is intentionally conservative: it adds compatibility shims and
// avoids “frameworky” behavior that could fight your existing widget code.

(function () {
  const W = window;

  // If already loaded, don't redefine (helps with partial reinjection).
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__compat_version) return;

  // -----------------------------
  // Prefix + URL helpers
  // -----------------------------
  function getPrefix() {
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : ".";
    return p && p.length ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;

    // Hosted at domain root
    if (prefix === "/") return absPath;

    // Already relative
    if (!String(absPath).startsWith("/")) return absPath;

    return String(prefix).replace(/\/+$/, "") + absPath;
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

  // -----------------------------
  // Fetch helpers
  // -----------------------------
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

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // Find the mounted root for a widget id, in a way that matches BOTH
  // the new runtime mounting and older markup conventions.
  function findWidgetRoot(widgetId) {
    if (!widgetId) return null;

    // Newer convention used by the runtime mounting: data-widget-id / data-widget-root
    let el =
      document.querySelector(`[data-widget-id="${cssEscape(widgetId)}"]`) ||
      document.querySelector(`[data-widget-root="${cssEscape(widgetId)}"]`);

    if (el) return el;

    // Older convention: slot wrapper itself
    // (Some widgets might expect the slot as their scope.)
    el = document.querySelector(`.btc-slot[data-widget="${cssEscape(widgetId)}"]`);
    return el || null;
  }

  // CSS.escape polyfill (limited but safe for ids like "btc-news", "mempool-goggles")
  function cssEscape(s) {
    s = String(s);
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    // minimal escape: backslash quotes and brackets
    return s.replace(/["\\\]\[]/g, "\\$&");
  }

  // -----------------------------
  // Asset injectors (deduped)
  // -----------------------------
  function ensureCSS(href, key) {
    const attr = `data-zzx-css-${String(key)}`;
    if (document.querySelector(`link[${attr}="1"]`)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const attr = `data-zzx-js-${String(key)}`;
    if (document.querySelector(`script[${attr}="1"]`)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute(attr, "1");
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  // -----------------------------
  // Core.onMount (compat)
  // -----------------------------
  // Many of your widget scripts use:
  //   Core.onMount("tip", (root, Core) => {...})
  // or
  //   Core.onMount(() => {...})  // generic DOM-ready
  //
  // This implementation:
  //  - calls immediately if root exists
  //  - otherwise queues + MutationObserver watches for mount
  const _onMountQueue = new Map(); // id -> [fn]
  let _mo = null;

  function _ensureObserver() {
    if (_mo) return;

    _mo = new MutationObserver(() => {
      // For each queued widgetId, check if root exists yet; if so, flush.
      for (const [id, fns] of _onMountQueue.entries()) {
        const root = findWidgetRoot(id);
        if (!root) continue;
        _onMountQueue.delete(id);
        for (const fn of fns) safeCall(fn, root);
      }
    });

    _mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function safeCall(fn, root) {
    try {
      fn(root, W.ZZXWidgetsCore);
    } catch (e) {
      console.warn(`[ZZXWidgetsCore] onMount handler failed (${root && root.getAttribute ? root.getAttribute("data-widget-id") : "?"})`, e);
    }
  }

  function onMount(a, b) {
    // Signature A: onMount(fn)
    if (typeof a === "function") {
      const fn = a;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          try { fn(document, W.ZZXWidgetsCore); } catch (e) { console.warn("[ZZXWidgetsCore] onMount(dom) failed", e); }
        }, { once: true });
      } else {
        try { fn(document, W.ZZXWidgetsCore); } catch (e) { console.warn("[ZZXWidgetsCore] onMount(dom) failed", e); }
      }
      return;
    }

    // Signature B: onMount(widgetId, fn)
    const widgetId = a;
    const fn = b;
    if (!widgetId || typeof fn !== "function") return;

    const root = findWidgetRoot(widgetId);
    if (root) {
      safeCall(fn, root);
      return;
    }

    // Queue for later
    const arr = _onMountQueue.get(widgetId) || [];
    arr.push(fn);
    _onMountQueue.set(widgetId, arr);
    _ensureObserver();
  }

  // -----------------------------
  // Widget registry (compat)
  // -----------------------------
  // Widgets currently failing are throwing:
  //   window.ZZXWidgets is undefined
  //   window.ZZXWidgetRegistry is undefined
  //
  // Existing widget patterns in your tree (observed from console logs):
  //   window.ZZXWidgets.register("price-24h", function(root, Core){...})
  //   window.ZZXWidgetRegistry.register("btc-news", function(root, Core){...})
  // Some widgets are self-booting and never register — we don't break those.
  const _registry = new Map(); // id -> { init: fn }
  const _mountedOnce = new Set(); // prevent double-init per root instance

  function _normalizeRegistrationArgs(id, def) {
    // Allow register(id, fn) or register(id, { init|mount|render|run: fn })
    if (typeof def === "function") return { init: def };

    if (def && typeof def === "object") {
      const fn =
        def.init ||
        def.mount ||
        def.render ||
        def.run ||
        def.start;

      if (typeof fn === "function") return { init: fn };
    }
    return { init: null };
  }

  function _initIfPresent(id) {
    const reg = _registry.get(id);
    if (!reg || typeof reg.init !== "function") return false;

    const root = findWidgetRoot(id);
    if (!root) return false;

    // Prevent repeated init on same DOM node
    const marker = `${id}::${getNodeKey(root)}`;
    if (_mountedOnce.has(marker)) return true;

    _mountedOnce.add(marker);

    try {
      reg.init(root, W.ZZXWidgetsCore);
    } catch (e) {
      console.warn(`[ZZXWidgets] init failed for ${id}`, e);
    }
    return true;
  }

  function getNodeKey(el) {
    // stable-ish key for the same element instance
    if (!el.__zzx_node_key) el.__zzx_node_key = Math.random().toString(36).slice(2);
    return el.__zzx_node_key;
  }

  function register(id, def) {
    if (!id) return;

    const { init } = _normalizeRegistrationArgs(id, def);
    if (typeof init !== "function") {
      console.warn(`[ZZXWidgets] register(${id}) called without a usable init fn`);
      _registry.set(id, { init: null });
      return;
    }

    _registry.set(id, { init });

    // If the widget DOM is already mounted (it is, in your runtime: HTML then JS),
    // initialize immediately.
    if (_initIfPresent(id)) return;

    // Otherwise, watch for mount and run once available.
    onMount(id, () => _initIfPresent(id));
  }

  function init(id) {
    return _initIfPresent(id);
  }

  function initAll() {
    let n = 0;
    for (const id of _registry.keys()) {
      if (_initIfPresent(id)) n++;
    }
    return n;
  }

  // Expose the registry objects exactly where your widgets expect them.
  const ZZXWidgetsAPI = {
    register,
    init,
    initAll,
    // For debugging
    _registry,
  };

  // Some widgets reference window.ZZXWidgets, others window.ZZXWidgetRegistry.
  W.ZZXWidgets = W.ZZXWidgets || ZZXWidgetsAPI;
  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || ZZXWidgetsAPI;

  // If one exists already (from older code), ensure it has at least register/init.
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register !== "function") W.ZZXWidgets.register = register;
  if (W.ZZXWidgets && typeof W.ZZXWidgets.init !== "function") W.ZZXWidgets.init = init;
  if (W.ZZXWidgets && typeof W.ZZXWidgets.initAll !== "function") W.ZZXWidgets.initAll = initAll;

  if (W.ZZXWidgetRegistry && typeof W.ZZXWidgetRegistry.register !== "function") W.ZZXWidgetRegistry.register = register;
  if (W.ZZXWidgetRegistry && typeof W.ZZXWidgetRegistry.init !== "function") W.ZZXWidgetRegistry.init = init;
  if (W.ZZXWidgetRegistry && typeof W.ZZXWidgetRegistry.initAll !== "function") W.ZZXWidgetRegistry.initAll = initAll;

  // Also: if widgets register before this file loads (rare but possible),
  // and left behind a queue, you can adapt here later. (Not adding guesswork now.)

  // -----------------------------
  // Optional: mount helper (kept, but NOT required)
  // -----------------------------
  // If you ever want to remount manually:
  //   Core.mountWidget("btc-news", slotEl, {force:true})
  //
  async function mountWidget(widgetId, slotEl, { force = false } = {}) {
    if (!widgetId || !slotEl) return false;

    if (!force && slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";

    // Ensure CSS
    ensureCSS(hrefWidgetCSS(widgetId), widgetId);

    // Mount HTML
    const html = await fetchText(hrefWidgetHTML(widgetId));
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    root.setAttribute("data-widget-root", widgetId);
    root.innerHTML = html;
    slotEl.replaceChildren(root);

    // Load JS (once)
    const ok = await ensureJS(hrefWidgetJS(widgetId), widgetId);
    if (!ok) return false;

    // If widget registered, init now.
    _initIfPresent(widgetId);
    return true;
  }

  async function mountAll(scope = document, { force = false } = {}) {
    const slots = qsa(".btc-slot[data-widget]", scope);
    const ps = [];
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;
      ps.push(mountWidget(id, slot, { force }));
    }
    const settled = await Promise.allSettled(ps);
    return settled;
  }

  // -----------------------------
  // Publish Core API
  // -----------------------------
  W.ZZXWidgetsCore = {
    __compat_version: "compat-1.0.0",

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
    findWidgetRoot,

    // assets
    ensureCSS,
    ensureJS,

    // compat hook used by widgets
    onMount,

    // optional mounters
    mountWidget,
    mountAll,
  };

  // If any widgets already registered (because another core existed),
  // try to init whatever is now mounted.
  try {
    if (W.ZZXWidgets && typeof W.ZZXWidgets.initAll === "function") {
      W.ZZXWidgets.initAll();
    }
  } catch (_) {}
})();
