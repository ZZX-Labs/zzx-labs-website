// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT v1.3 (fixes “register-based widgets don’t run”)
//
// What this fixes (based on your current status):
// - tip/drift/high-low/repo now work because they use Core.onMount()
// - MOST other widgets still don’t because they use:
//      window.ZZXWidgets.register(id, initFn)
//   BUT your runtime is loading widget.js BEFORE widget.html is mounted.
//   So register() happens when the widget root does NOT exist yet.
//   Previously, your older runtime/registry probably called init later.
//   Now we make the registry robust:
//      register() -> if root exists, init immediately
//                -> if root does NOT exist, queue + auto-init when it appears
//
// This requires NO per-widget edits.

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
    const path = String(location.pathname || "/");
    const isRootish = (path === "/" || path.endsWith("/index.html"));
    if (isRootish && String(prefix).startsWith("..")) return ".";
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
    if (prefix === "/") return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function abs(pathAbs) {
    return join(getPrefix(), pathAbs);
  }

  // ---------------------------------------------------------
  // Patch fetch to be prefix-aware for "/..." URLs
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
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  // ---------------------------------------------------------
  // Fetch helpers
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
  // Registry + auto-init when DOM appears (CRITICAL FIX)
  // ---------------------------------------------------------
  const _registry = new Map();     // id -> initFn
  const _booted   = new Set();     // id@@uid -> boolean
  const _pending  = new Set();     // ids waiting for DOM root
  let _mo = null;

  function findWidgetRootById(id) {
    // Two markers supported (your widgets use either)
    const safe = CSS.escape(String(id));
    return (
      document.querySelector(`[data-widget-root="${safe}"]`) ||
      document.querySelector(`[data-widget-id="${safe}"]`)
    );
  }

  function safeInit(id, root) {
    if (!id || !root) return;

    if (root.dataset && !root.dataset.__zzx_uid) {
      root.dataset.__zzx_uid = Math.random().toString(16).slice(2);
    }
    const uniq = `${id}@@${root.dataset ? root.dataset.__zzx_uid : ""}`;
    if (_booted.has(uniq)) return;

    const fn = _registry.get(String(id));
    if (typeof fn !== "function") return;

    try {
      _booted.add(uniq);
      fn(root, W.ZZXWidgetsCore);
    } catch (e) {
      console.warn(`[ZZXWidgets] init failed for ${id}:`, e);
    }
  }

  function startObserverIfNeeded() {
    if (_mo) return;

    _mo = new MutationObserver(() => {
      // Try to resolve pending ids when DOM changes
      if (_pending.size === 0) return;

      for (const id of Array.from(_pending)) {
        const root = findWidgetRootById(id);
        if (root) {
          _pending.delete(id);
          safeInit(id, root);
        }
      }

      // If nothing pending, stop observing (no leaks)
      if (_pending.size === 0) {
        try { _mo.disconnect(); } catch (_) {}
        _mo = null;
      }
    });

    _mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function register(id, initFn) {
    if (!id || typeof initFn !== "function") return;
    id = String(id);

    _registry.set(id, initFn);

    // If already mounted, init immediately
    const root = findWidgetRootById(id);
    if (root) {
      safeInit(id, root);
      return;
    }

    // Otherwise, queue for auto-init when it mounts
    _pending.add(id);
    startObserverIfNeeded();

    // Also do a short timed retry window (covers “no DOM mutation” edge cases)
    // without leaving timers forever.
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const r2 = findWidgetRootById(id);
      if (r2) {
        clearInterval(t);
        _pending.delete(id);
        safeInit(id, r2);
      } else if (tries >= 10) {
        clearInterval(t);
        // keep in _pending for the MutationObserver (in case it mounts later)
      }
    }, 200);
  }

  function has(id) {
    return _registry.has(String(id));
  }

  // Expose global registry objects your widgets reference
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.has = has;

  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.has = has;

  // ---------------------------------------------------------
  // Core.onMount (for widgets that use it)
  // ---------------------------------------------------------
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

      const root = findWidgetRootById(widgetId);
      if (root) {
        try { fn(root); } catch (e) { console.warn(`[Core.onMount] ${widgetId} callback failed:`, e); }
        return;
      }

      const mo = new MutationObserver(() => {
        const r2 = findWidgetRootById(widgetId);
        if (r2) {
          mo.disconnect();
          try { fn(r2); } catch (e) { console.warn(`[Core.onMount] ${widgetId} callback failed:`, e); }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, 5000);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      setTimeout(run, 0);
    }
  }

  // ---------------------------------------------------------
  // Optional mounting helpers (kept)
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

      // If the widget registered, init now
      const fn = _registry.get(String(widgetId));
      if (typeof fn === "function") safeInit(String(widgetId), root);

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
    __version: "1.3.0-dropin",

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

    // compat
    onMount,

    // mount
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
