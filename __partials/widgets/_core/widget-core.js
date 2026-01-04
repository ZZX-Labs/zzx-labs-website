// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT — fixes “widgets render but never load data”
// Root cause: many widget.js files bind on DOMContentLoaded. When we load them *after*
// DOMContentLoaded has already fired (because runtime mounts them later), their boot
// never runs. This file patches that safely: any *late* DOMContentLoaded listeners
// fire immediately (next tick) when the DOM is already ready.
//
// This avoids editing every widget.

/* eslint-disable no-console */
(function () {
  const W = window;

  // Prevent double-definition across reinjections
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ---------------------------------------------------------------------------
  // 0) DOMContentLoaded late-listener patch (the critical fix)
  // ---------------------------------------------------------------------------
  (function patchDOMContentLoadedOnce() {
    if (W.__ZZX_PATCHED_DOMCONTENTLOADED) return;
    W.__ZZX_PATCHED_DOMCONTENTLOADED = true;

    function isDOMReady() {
      return document.readyState !== "loading";
    }

    // Store originals
    const origDocAdd = document.addEventListener.bind(document);
    const origWinAdd = W.addEventListener.bind(W);

    // Wrap document.addEventListener
    document.addEventListener = function (type, listener, options) {
      // If someone registers DOMContentLoaded after it already fired, run it ASAP.
      if (
        type === "DOMContentLoaded" &&
        typeof listener === "function" &&
        isDOMReady()
      ) {
        // Preserve async semantics (don’t run inline)
        Promise.resolve().then(() => {
          try {
            // Event object is optional in most handlers; give a real one anyway.
            listener.call(document, new Event("DOMContentLoaded"));
          } catch (e) {
            console.warn("[ZZXWidgetsCore] DOMContentLoaded late-listener error:", e);
          }
        });
        // Still register it (harmless) in case some code expects it to exist.
        // But avoid double-calls by registering a noop wrapper.
        return origDocAdd(type, function () {}, options);
      }
      return origDocAdd(type, listener, options);
    };

    // Wrap window.addEventListener (some widgets attach to window instead)
    W.addEventListener = function (type, listener, options) {
      if (
        type === "DOMContentLoaded" &&
        typeof listener === "function" &&
        isDOMReady()
      ) {
        Promise.resolve().then(() => {
          try {
            listener.call(W, new Event("DOMContentLoaded"));
          } catch (e) {
            console.warn("[ZZXWidgetsCore] window DOMContentLoaded late-listener error:", e);
          }
        });
        return origWinAdd(type, function () {}, options);
      }
      return origWinAdd(type, listener, options);
    };
  })();

  // ---------------------------------------------------------------------------
  // 1) Prefix + URL helpers (prefix-aware from any depth)
  // ---------------------------------------------------------------------------
  function getPrefix() {
    // partials-loader sets window.ZZX.PREFIX = '.' | '..' | ... | '/'
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : ".";
    return p && p.length ? p : ".";
  }

  function join(prefix, absPath) {
    // absPath should start with "/" (site-absolute)
    if (!absPath) return absPath;
    if (/^https?:\/\//i.test(absPath)) return absPath;
    if (prefix === "/") return absPath; // hosted at domain root
    if (!absPath.startsWith("/")) return absPath; // already relative
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
  function hrefWidgetData(widgetId, filename) {
    // convenience for widgets that keep JSON beside them:
    // Core.hrefWidgetData("btc-lost", "btc-lost.json")
    return join(getPrefix(), `${widgetBase(widgetId)}/${filename}`);
  }

  // ---------------------------------------------------------------------------
  // 2) Fetch helpers
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
  // 3) DOM helpers (scoped)
  // ---------------------------------------------------------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // ---------------------------------------------------------------------------
  // 4) Asset injectors (deduped)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 5) Widget mounting (slot stays, root mounts inside)
  // ---------------------------------------------------------------------------
  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    // Back-compat marker some widgets use:
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
      // CSS first (safe even if widget.css is empty)
      ensureCSS(hrefWidgetCSS(widgetId), widgetId);

      // HTML next
      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;
      slotEl.replaceChildren(root);

      // JS last (after DOM exists)
      await ensureJS(hrefWidgetJS(widgetId), widgetId);

      // Optional init hook (if any widget uses it)
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
    // Supports both patterns:
    // 1) old:  <div class="btc-slot" data-widget="nodes"></div>
    // 2) new:  <div data-widget-slot="nodes"></div>
    const slotsA = qsa(".btc-slot[data-widget]", scope);
    const slotsB = qsa("[data-widget-slot]", scope);

    const tasks = [];

    for (const slot of slotsA) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;
      tasks.push(mountWidget(id, slot, { force }));
    }

    for (const slot of slotsB) {
      const id = slot.getAttribute("data-widget-slot");
      if (!id) continue;
      tasks.push(mountWidget(id, slot, { force }));
    }

    return await Promise.allSettled(tasks);
  }

  // ---------------------------------------------------------------------------
  // 6) Public Core API (back-compat with existing widgets)
  // ---------------------------------------------------------------------------
  W.ZZXWidgetsCore = {
    __version: "1.1.0-dropin",

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
    hrefWidgetData,
  };
})();
