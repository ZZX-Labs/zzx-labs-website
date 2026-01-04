// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (single file)
//
// Fixes broken widgets by restoring the legacy globals your widget.js files expect:
//   - window.ZZXWidgets.register(...)
//   - window.ZZXWidgetRegistry.register(...)
//   - Core.onMount(...)
//
// And keeps the newer helpers (prefix-aware fetch, ensureCSS/ensureJS, scoped qs/qsa).
// Goal: you should NOT have to edit every widget.
//
// How it works:
//   - Widget scripts typically call `ZZXWidgets.register(id, initFn)` (or ZZXWidgetRegistry.register)
//   - Runtime injects widget.html into the slot and then loads widget.js
//   - This core guarantees `register()` exists and will run init immediately if the DOM is already mounted.
//   - Also supports delayed mount: init is queued until the widget root appears.

(function () {
  const W = window;

  // If already loaded, don't clobber a live runtime (but do ensure shims exist).
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) {
    ensureLegacyShims(W.ZZXWidgetsCore);
    return;
  }

  // ----------------------------
  // Prefix + URL helpers
  // ----------------------------
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
  // DOM helpers (scoped)
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
  // Legacy-compatible mount hooks
  // ----------------------------
  // Map widgetId -> [fn, fn, ...]
  const _onMount = new Map();

  function getWidgetRoot(widgetId) {
    // Support BOTH conventions you’ve used:
    //   - runtime.js slot attribute: [data-widget-slot="id"]
    //   - core mount root markers:  [data-widget-id="id"] or [data-widget-root="id"]
    return (
      document.querySelector(`[data-widget-id="${cssEscape(widgetId)}"]`) ||
      document.querySelector(`[data-widget-root="${cssEscape(widgetId)}"]`) ||
      document.querySelector(`[data-widget-slot="${cssEscape(widgetId)}"] [data-widget-id]`) ||
      document.querySelector(`[data-widget-slot="${cssEscape(widgetId)}"] [data-widget-root]`) ||
      document.querySelector(`[data-widget-slot="${cssEscape(widgetId)}"]`) ||
      null
    );
  }

  // Core.onMount(widgetId, fn)
  // If root exists now -> run now. Else queue until it appears.
  function onMount(widgetId, fn) {
    if (!widgetId || typeof fn !== "function") return;
    const id = String(widgetId);

    const rootNow = getWidgetRoot(id);
    if (rootNow) {
      try { fn(rootNow, W.ZZXWidgetsCore); } catch (e) { console.warn(`[Core.onMount] ${id}`, e); }
      return;
    }

    const arr = _onMount.get(id) || [];
    arr.push(fn);
    _onMount.set(id, arr);
  }

  function flushMount(widgetId, rootEl) {
    const id = String(widgetId);
    const arr = _onMount.get(id);
    if (!arr || !arr.length) return;
    _onMount.delete(id);
    for (const fn of arr) {
      try { fn(rootEl, W.ZZXWidgetsCore); } catch (e) { console.warn(`[Core.flushMount] ${id}`, e); }
    }
  }

  // ----------------------------
  // Widget mounting (optional use)
  // ----------------------------
  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    root.setAttribute("data-widget-root", widgetId); // back-compat
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
      ensureCSS(hrefWidgetCSS(widgetId), widgetId);

      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;
      slotEl.replaceChildren(root);

      // Let legacy init queues run as soon as root exists
      flushMount(widgetId, root);

      await ensureJS(hrefWidgetJS(widgetId), widgetId);

      // If widget registered AFTER its script loads, register() will run init immediately.
      // If widget registered BEFORE (rare), we already flushed queued fns above.
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
    const tasks = [];

    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;
      tasks.push(mountWidget(id, slot, { force }));
    }

    return await Promise.allSettled(tasks);
  }

  // ----------------------------
  // Legacy registries your widget.js expects
  // ----------------------------
  // Widgets in your tree use BOTH names:
  //   - window.ZZXWidgets.register(id, initFn)
  //   - window.ZZXWidgetRegistry.register(id, initFn)
  //
  // Some widgets call Core.onMount(...) instead.
  //
  // This shim makes all of these converge on the same behavior.

  const _registry = new Map(); // id -> initFn

  function normalizeId(id) {
    return String(id || "").trim();
  }

  function callInit(id, initFn, root) {
    // Support common shapes:
    //  - function(root, Core) { ... }
    //  - object with mount/init function { mount(root, Core) }
    //  - function(Core) returning something (rare) -> we still call with (root, Core)
    try {
      if (typeof initFn === "function") {
        initFn(root, W.ZZXWidgetsCore);
        return;
      }
      if (initFn && typeof initFn === "object") {
        const f = initFn.mount || initFn.init || initFn.boot;
        if (typeof f === "function") {
          f.call(initFn, root, W.ZZXWidgetsCore);
        }
      }
    } catch (e) {
      console.warn(`[ZZXWidgets.register/init] ${id}`, e);
    }
  }

  function register(id, initFn) {
    const wid = normalizeId(id);
    if (!wid) return;

    _registry.set(wid, initFn);

    // If already mounted, run immediately.
    const root = getWidgetRoot(wid);
    if (root) {
      callInit(wid, initFn, root);
      return;
    }

    // Otherwise, run when it mounts.
    onMount(wid, (rootEl) => callInit(wid, initFn, rootEl));
  }

  function get(id) {
    const wid = normalizeId(id);
    return _registry.get(wid);
  }

  function unregister(id) {
    const wid = normalizeId(id);
    _registry.delete(wid);
  }

  function ensureLegacyShims(Core) {
    // window.ZZXWidgets
    if (!W.ZZXWidgets || typeof W.ZZXWidgets !== "object") W.ZZXWidgets = {};
    if (typeof W.ZZXWidgets.register !== "function") W.ZZXWidgets.register = register;
    if (typeof W.ZZXWidgets.get !== "function") W.ZZXWidgets.get = get;
    if (typeof W.ZZXWidgets.unregister !== "function") W.ZZXWidgets.unregister = unregister;

    // window.ZZXWidgetRegistry (some widgets use this name)
    if (!W.ZZXWidgetRegistry || typeof W.ZZXWidgetRegistry !== "object") W.ZZXWidgetRegistry = {};
    if (typeof W.ZZXWidgetRegistry.register !== "function") W.ZZXWidgetRegistry.register = register;
    if (typeof W.ZZXWidgetRegistry.get !== "function") W.ZZXWidgetRegistry.get = get;
    if (typeof W.ZZXWidgetRegistry.unregister !== "function") W.ZZXWidgetRegistry.unregister = unregister;

    // Some widgets referenced Core.onMount and you saw failures earlier
    if (typeof Core.onMount !== "function") Core.onMount = onMount;
  }

  // Tiny CSS.escape fallback
  function cssEscape(s) {
    if (W.CSS && typeof W.CSS.escape === "function") return W.CSS.escape(String(s));
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // ----------------------------
  // Export Core
  // ----------------------------
  W.ZZXWidgetsCore = {
    __version: "1.0.0-dropin-shim",

    // prefix + url
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
    ensureCSS,
    ensureJS,

    // mount
    mountWidget,
    mountAll,

    // legacy hook used by some widgets
    onMount,
  };

  // Install shims immediately
  ensureLegacyShims(W.ZZXWidgetsCore);
})();
