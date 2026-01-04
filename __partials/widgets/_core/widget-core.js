// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (single-file fix)
// Fixes “widgets render but never load data” by:
//  1) Making late-registered DOMContentLoaded/load listeners fire immediately
//     (many widget.js files bind on DOMContentLoaded and were being injected AFTER it fired)
//  2) Prefix-rewriting SAME-ORIGIN absolute fetches ("/static/...", "/api/...", "/__partials/...")
//     so GH Pages / subpath hosting works without editing every widget
//  3) Keeping back-compat API: window.ZZXWidgetsCore.{qs,qsa,fetchJSON,fetchText,ensureCSS,ensureJS,mountWidget,mountAll,...}

(function () {
  const W = window;

  // Prevent double-definition across reinjections
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ----------------------------
  // Prefix + URL helpers
  // ----------------------------
  function getPrefix() {
    // partials-loader sets window.ZZX.PREFIX = '.' | '..' | ... | '/'
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : ".";
    return p && p.length ? p : ".";
  }

  function join(prefix, absPath) {
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath; // hosted at domain root
    if (!String(absPath).startsWith("/")) return absPath; // already relative
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
  // (1) Late DOM events shim (THE big fix)
  // ----------------------------
  // Many of your widget scripts do:
  //   document.addEventListener("DOMContentLoaded", boot)
  // but runtime injects widget.js AFTER DOMContentLoaded already fired.
  // Solution: if DOM is already ready, immediately invoke those callbacks.

  (function patchLateDOMEvents() {
    if (document.__zzx_patched_dom_events) return;
    document.__zzx_patched_dom_events = true;

    const origDocAdd = document.addEventListener.bind(document);
    const origWinAdd = window.addEventListener.bind(window);

    function callSoon(fn, ctx, args) {
      Promise.resolve().then(() => {
        try { fn.apply(ctx, args); } catch (e) { console.warn("[ZZXWidgetsCore] listener error:", e); }
      });
    }

    // Patch document.addEventListener
    document.addEventListener = function (type, listener, options) {
      // Always register normally first (so removeEventListener still works)
      origDocAdd(type, listener, options);

      // If DOMContentLoaded already passed, fire listener ASAP.
      if (type === "DOMContentLoaded" && document.readyState !== "loading") {
        // Respect { once:true } by calling once and leaving native registration in place.
        // (Native once would have removed it, but event won't fire again anyway.)
        if (typeof listener === "function") callSoon(listener, document, [new Event("DOMContentLoaded")]);
        else if (listener && typeof listener.handleEvent === "function") callSoon(listener.handleEvent, listener, [new Event("DOMContentLoaded")]);
      }
    };

    // Patch window.addEventListener for "load" (some widgets use it)
    window.addEventListener = function (type, listener, options) {
      origWinAdd(type, listener, options);

      if (type === "load" && document.readyState === "complete") {
        if (typeof listener === "function") callSoon(listener, window, [new Event("load")]);
        else if (listener && typeof listener.handleEvent === "function") callSoon(listener.handleEvent, listener, [new Event("load")]);
      }
    };
  })();

  // ----------------------------
  // (2) Prefix-rewrite SAME-ORIGIN absolute fetches
  // ----------------------------
  // If site is served from /<repo>/ (GH Pages), fetch("/static/...") hits domain root and 404s.
  // We rewrite ONLY string URLs that begin with "/" and are not already prefixed.

  (function patchFetch() {
    if (W.__zzx_fetch_patched) return;
    W.__zzx_fetch_patched = true;

    const origFetch = W.fetch.bind(W);

    function rewriteUrl(input) {
      if (typeof input !== "string") return input;
      if (!input.startsWith("/")) return input;
      // If already prefixed (e.g., "./static/..."), leave it.
      const prefix = getPrefix();
      if (prefix === "/") return input;

      // Avoid double-prefix:
      const normalizedPrefix = String(prefix).replace(/\/+$/, "");
      if (normalizedPrefix && input.startsWith(normalizedPrefix + "/")) return input;

      return normalizedPrefix + input;
    }

    W.fetch = function (input, init) {
      try {
        const rewritten = rewriteUrl(input);
        return origFetch(rewritten, init);
      } catch (e) {
        return origFetch(input, init);
      }
    };
  })();

  // ----------------------------
  // Fetch helpers (widgets often use these)
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
      // IMPORTANT: do NOT rely on defer/DOMContentLoaded timing.
      // Dynamic scripts execute immediately when appended; our DOMContentLoaded shim
      // ensures widget handlers still fire if they register late.
      const s = document.createElement("script");
      s.src = src;
      s.async = true; // load ASAP
      s.setAttribute(attr, "1");
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(s);
    });
  }

  // ----------------------------
  // Widget mounting
  // ----------------------------
  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    // Back-compat for scripts that use data-widget-root="..."
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
      // CSS first (safe even if empty file)
      ensureCSS(hrefWidgetCSS(widgetId), widgetId);

      // HTML mount next
      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;

      // Keep slot stable; replace children only
      slotEl.replaceChildren(root);

      // JS last
      await ensureJS(hrefWidgetJS(widgetId), widgetId);

      // Optional init hook (if you ever add it)
      try {
        const initMap = W.ZZXWidgetInit;
        if (initMap && typeof initMap === "object" && typeof initMap[widgetId] === "function") {
          initMap[widgetId](root, W.ZZXWidgetsCore);
        } else if (typeof initMap === "function") {
          initMap(widgetId, root, W.ZZXWidgetsCore);
        }
      } catch (_) {}

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
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __version: "1.0.1-dropin",

    // prefix + url helpers
    getPrefix,
    join,

    // fetch helpers
    fetchText,
    fetchJSON,

    // DOM helpers
    qs,
    qsa,

    // assets
    ensureCSS,
    ensureJS,

    // mount
    mountWidget,
    mountAll,

    // widget path helpers
    widgetBase,
    hrefWidgetHTML,
    hrefWidgetCSS,
    hrefWidgetJS,
  };
})();
