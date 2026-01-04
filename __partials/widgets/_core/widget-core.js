// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — DROP-IN REPLACEMENT
//
// Fixes your current failure mode:
// - Many widget scripts call: window.ZZXWidgets.register(...)
// - Some call: window.ZZXWidgetRegistry.register(...)
// - Some call: Core.onMount(...)
// Those globals/APIs MUST exist before any widget.js executes.
//
// This core provides:
// - window.ZZXWidgets + window.ZZXWidgetRegistry (same registry object)
// - Core.qs/qsa/fetchJSON/fetchText helpers
// - Core.onMount(fn[, widgetId]) that reliably fires when that widget's DOM is present
// - Core.getWidgetRoot(widgetId) and Core.inferWidgetId() from current script URL
//
// It does NOT require rewriting each widget.

(function () {
  "use strict";

  const W = window;

  // Avoid redefining if already present
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ----------------------------
  // Prefix-aware path helpers
  // ----------------------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath;
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

  // ----------------------------
  // Fetch helpers
  // ----------------------------
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

  // ----------------------------
  // DOM helpers (optionally scoped)
  // ----------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // ----------------------------
  // Asset injectors (deduped)
  // ----------------------------
  function ensureCSS(href, key) {
    const attr = `data-zzx-css-${key}`;
    if (document.querySelector(`link[${attr}="1"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const attr = `data-zzx-js-${key}`;
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

  // ----------------------------
  // Widget root detection
  // ----------------------------
  function getWidgetRoot(widgetId) {
    if (!widgetId) return null;

    // Our runtime typically tags either the slot or an inner root with data-widget-id.
    // We accept both patterns.
    let el =
      document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`) ||
      document.querySelector(`[data-widget-root="${CSS.escape(widgetId)}"]`);

    if (!el) return null;

    // If the first match is the slot, prefer the inner widget root if present.
    const inner =
      el.querySelector?.(`.zzx-widget[data-widget-id="${CSS.escape(widgetId)}"]`) ||
      el.querySelector?.(`[data-widget-root="${CSS.escape(widgetId)}"]`);
    if (inner) return inner;

    return el;
  }

  function widgetIdFromScriptSrc(src) {
    if (!src) return null;
    const m = String(src).match(/\/__partials\/widgets\/([^/]+)\/widget\.js(?:\?|#|$)/);
    return m ? m[1] : null;
  }

  function inferWidgetId() {
    // Prefer currentScript (works for most browsers when executing the widget.js)
    const cs = document.currentScript;
    const id = widgetIdFromScriptSrc(cs && cs.src);
    return id || null;
  }

  // ----------------------------
  // Registry + onMount
  // ----------------------------
  const _registry = new Map();     // widgetId -> Set<fn>
  const _ranOnce = new WeakSet();  // per root+fn protection when using observers
  let _mo = null;

  function _ensureObserver() {
    if (_mo) return;

    _mo = new MutationObserver(() => {
      // On any DOM change, attempt to flush all registered inits that now have roots.
      for (const [id, fns] of _registry.entries()) {
        const root = getWidgetRoot(id);
        if (!root) continue;
        for (const fn of fns) {
          const keyObj = { root, fn }; // used only to create stable pair keys
          // WeakSet cannot store tuples; so we store a per-root marker map on root.
          const markerKey = `__zzx_ran_${id}`;
          if (!root[markerKey]) root[markerKey] = new Set();
          if (root[markerKey].has(fn)) continue;
          root[markerKey].add(fn);
          try { fn(root, W.ZZXWidgetsCore); } catch (e) { console.warn(`[ZZXWidgets] init error (${id})`, e); }
        }
      }
    });

    _mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function _registerInternal(id, fn) {
    if (!id || typeof fn !== "function") return false;

    if (!_registry.has(id)) _registry.set(id, new Set());
    _registry.get(id).add(fn);

    // Try immediate flush if already mounted
    const root = getWidgetRoot(id);
    if (root) {
      const markerKey = `__zzx_ran_${id}`;
      if (!root[markerKey]) root[markerKey] = new Set();
      if (!root[markerKey].has(fn)) {
        root[markerKey].add(fn);
        try { fn(root, W.ZZXWidgetsCore); } catch (e) { console.warn(`[ZZXWidgets] init error (${id})`, e); }
      }
      return true;
    }

    // Otherwise watch for mount
    _ensureObserver();
    return true;
  }

  // Public: register(widgetId, fn) OR register(fn) (widgetId inferred from currentScript URL)
  function register(a, b) {
    if (typeof a === "function") {
      const id = inferWidgetId();
      return _registerInternal(id, a);
    }
    return _registerInternal(a, b);
  }

  // Public: onMount(fn, widgetId?)
  // - If widgetId omitted, infer from currentScript
  // - fn(root, Core)
  function onMount(fn, widgetId) {
    const id = widgetId || inferWidgetId();
    return _registerInternal(id, fn);
  }

  // ----------------------------
  // Optional: mount helpers (kept for compatibility; runtime may not use these)
  // ----------------------------
  async function mountWidget(widgetId, slotEl, { force = false } = {}) {
    if (!widgetId) throw new Error("mountWidget: widgetId required");
    if (!slotEl) throw new Error(`mountWidget: slotEl missing for ${widgetId}`);

    if (!force && slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";

    // Make sure CSS is in (ok if 404 — it will just not apply)
    try { ensureCSS(hrefWidgetCSS(widgetId), widgetId); } catch (_) {}

    // HTML
    const html = await fetchText(hrefWidgetHTML(widgetId));
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    root.setAttribute("data-widget-root", widgetId);
    root.innerHTML = html;

    slotEl.replaceChildren(root);

    // JS
    await ensureJS(hrefWidgetJS(widgetId), widgetId);

    // Flush any queued register/onMount handlers now that root exists
    const fns = _registry.get(widgetId);
    if (fns && fns.size) {
      const markerKey = `__zzx_ran_${widgetId}`;
      if (!root[markerKey]) root[markerKey] = new Set();
      for (const fn of fns) {
        if (root[markerKey].has(fn)) continue;
        root[markerKey].add(fn);
        try { fn(root, W.ZZXWidgetsCore); } catch (e) { console.warn(`[ZZXWidgets] init error (${widgetId})`, e); }
      }
    }

    return true;
  }

  async function mountAll(scope = document, { force = false } = {}) {
    const slots =
      qsa("[data-widget-slot]", scope).map(el => ({
        id: el.getAttribute("data-widget-slot"),
        el
      }));

    const jobs = [];
    for (const { id, el } of slots) {
      if (!id) continue;
      jobs.push(mountWidget(id, el, { force }));
    }
    return await Promise.allSettled(jobs);
  }

  // ----------------------------
  // Publish Core + Registry globals
  // ----------------------------
  const Core = {
    __version: "1.1.0-dropin",

    // prefix + url helpers
    getPrefix,
    join,

    // widget path helpers
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
    ensureCSS,
    ensureJS,

    // mount (optional)
    mountWidget,
    mountAll,

    // mount/registry compatibility
    getWidgetRoot,
    inferWidgetId,
    onMount
  };

  W.ZZXWidgetsCore = Core;

  // These are what your widget.js files are currently expecting.
  const Registry = { register };

  // Provide both names (your console shows both are referenced)
  W.ZZXWidgets = Registry;
  W.ZZXWidgetRegistry = Registry;

  // Safety: if any widgets registered before this loaded (rare), we can’t recover,
  // but ensuring this file loads before any widget.js is the real fix.
})();
