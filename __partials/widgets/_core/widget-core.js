// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core (DROP-IN REPLACEMENT)
//
// This file is the compatibility spine that your existing widgets expect.
// It restores:
//   - window.ZZXWidgets.register(...)  (used by many widget.js files)
//   - window.ZZXWidgetRegistry.register(...) (alias)
//   - Core.onMount(...) (used by several widgets)
// And it keeps the prefix-aware fetch + mount utilities.
//
// Key behavior:
//   1) runtime mounts widget.html into the slot
//   2) widget-core loads widget.js
//   3) if that widget.js called register(), widget-core immediately calls def.mount()
//      AFTER the DOM exists (so data loads again).
//
// No page edits required.

(function () {
  const W = window;

  // Prevent double-definition across reinjections
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ----------------------------
  // Prefix + URL helpers
  // ----------------------------
  function getPrefix() {
    // partials-loader sets window.ZZX.PREFIX = '.' | '..' | ... | '/'
    const p = (W.ZZX && typeof W.ZZX.PREFIX === "string") ? W.ZZX.PREFIX : ".";
    return p && p.length ? p : ".";
  }

  function join(prefix, absPath) {
    // absPath should be site-absolute "/x/y" OR full URL.
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath; // hosted at domain root
    if (!absPath.startsWith("/")) return absPath; // already relative
    return prefix.replace(/\/+$/, "") + absPath;
  }

  function widgetBase(widgetId) {
    return `/__partials/widgets/${widgetId}`;
  }

  function hrefWidgetHTML(widgetId) { return join(getPrefix(), `${widgetBase(widgetId)}/widget.html`); }
  function hrefWidgetCSS(widgetId)  { return join(getPrefix(), `${widgetBase(widgetId)}/widget.css`); }
  function hrefWidgetJS(widgetId)   { return join(getPrefix(), `${widgetBase(widgetId)}/widget.js`); }

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
  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function qsa(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }

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
  // Registry (what your widgets expect)
  // ----------------------------
  const _registry = new Map(); // id -> def

  function register(id, def) {
    if (!id) throw new Error("ZZXWidgets.register(id, def): missing id");
    if (!def || typeof def !== "object") throw new Error(`ZZXWidgets.register(${id}): def must be object`);
    _registry.set(id, def);
    return true;
  }

  function get(id) {
    return _registry.get(id);
  }

  // ----------------------------
  // onMount compatibility
  // ----------------------------
  // Supports both patterns:
  //   Core.onMount(() => { ... })                     // run on DOM ready
  //   Core.onMount("widget-id", (root) => { ... })    // run when widget root exists
  function onMount(a, b) {
    // Pattern 1: Core.onMount(fn)
    if (typeof a === "function" && !b) {
      const fn = a;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn, { once: true });
      } else {
        fn();
      }
      return;
    }

    // Pattern 2: Core.onMount(widgetId, fn)
    const widgetId = String(a || "").trim();
    const fn = b;

    if (!widgetId || typeof fn !== "function") return;

    const findRoot = () =>
      document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`)
      || document.querySelector(`[data-widget-root="${CSS.escape(widgetId)}"]`);

    const runIfFound = () => {
      const root = findRoot();
      if (root && !root.__zzx_onmount_ran) {
        root.__zzx_onmount_ran = true;
        try { fn(root); } catch (e) { console.warn(`[ZZX] onMount(${widgetId}) error:`, e); }
        return true;
      }
      return false;
    };

    if (runIfFound()) return;

    // Wait briefly for injection via MutationObserver
    const mo = new MutationObserver(() => {
      if (runIfFound()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Hard stop after 3s to avoid runaway observers
    setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, 3000);
  }

  // ----------------------------
  // Widget mount
  // ----------------------------
  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    // Back-compat: many of your widget scripts query this
    root.setAttribute("data-widget-root", widgetId);
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

    // avoid double-mount unless forced
    if (!force && slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";
    slotEl.dataset.loading = "1";

    try {
      // 1) CSS first (safe even if empty)
      ensureCSS(hrefWidgetCSS(widgetId), widgetId);

      // 2) HTML -> root
      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;
      slotEl.replaceChildren(root);

      // 3) JS after DOM exists
      await ensureJS(hrefWidgetJS(widgetId), widgetId);

      // 4) If widget registered itself, mount it now (THIS is what was missing)
      const def = get(widgetId);
      if (def && !root.__zzx_widget_mounted) {
        root.__zzx_widget_mounted = true;

        // Common convention support:
        // def.mount(root, Core)  OR  def.mount({ root, id, Core })
        try {
          if (typeof def.mount === "function") {
            if (def.mount.length >= 2) def.mount(root, W.ZZXWidgetsCore);
            else def.mount({ root, id: widgetId, Core: W.ZZXWidgetsCore });
          } else if (typeof def.init === "function") {
            if (def.init.length >= 2) def.init(root, W.ZZXWidgetsCore);
            else def.init({ root, id: widgetId, Core: W.ZZXWidgetsCore });
          }
        } catch (e) {
          console.warn(`[ZZX] ${widgetId} mount/init error:`, e);
        }
      }

      return true;
    } catch (err) {
      renderLoadFailed(slotEl, widgetId, err);
      return false;
    } finally {
      slotEl.dataset.loading = "0";
    }
  }

  async function mountAll(scope = document, { force = false } = {}) {
    const slots = qsa(".btc-slot[data-widget], [data-widget-slot]", scope);

    // Supports both slot styles:
    //   <div class="btc-slot" data-widget="id"></div>
    //   <div data-widget-slot="id"></div>
    const tasks = [];

    for (const slot of slots) {
      const id = slot.getAttribute("data-widget") || slot.getAttribute("data-widget-slot");
      if (!id) continue;
      tasks.push(mountWidget(id, slot, { force }));
    }

    return await Promise.allSettled(tasks);
  }

  // ----------------------------
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __version: "1.2.0-dropin",

    // prefix + url helpers
    getPrefix,
    join,
    widgetBase,
    hrefWidgetHTML,
    hrefWidgetCSS,
    hrefWidgetJS,

    // fetch helpers
    fetchText,
    fetchJSON,

    // DOM helpers
    qs,
    qsa,

    // assets
    ensureCSS,
    ensureJS,

    // lifecycle compatibility
    onMount,

    // mounting
    mountWidget,
    mountAll,
  };

  // Registry globals your widgets currently call
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.get = get;

  // Some widgets use this name instead:
  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || W.ZZXWidgets;
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.get = get;
})();
