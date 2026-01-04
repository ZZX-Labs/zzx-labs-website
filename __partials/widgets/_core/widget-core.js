// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core (DROP-IN REPLACEMENT)
// Goals:
// - Make ALL widgets mount reliably from any depth (prefix-aware)
// - Load each widget's widget.html + widget.css + widget.js
// - Keep compatibility with existing widget scripts that do:
//     const Core = window.ZZXWidgetsCore; Core.qs(...); Core.fetchJSON(...)
// - Provide scoped querying so widgets don't collide
// - Never require editing every widget

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
  // Widget mounting
  // ----------------------------
  function mkWidgetRoot(widgetId) {
    const root = document.createElement("div");
    root.className = "zzx-widget";
    root.setAttribute("data-widget-id", widgetId);
    // Back-compat for runtime/widget scripts in your tree:
    root.setAttribute("data-widget-root", widgetId);
    return root;
  }

  function renderLoadFailed(slotEl, widgetId, err) {
    // Keep your UI language consistent with the screenshot ("widget load failed")
    // but do NOT destroy the slot so future retries can remount.
    slotEl.innerHTML = "";
    const card = document.createElement("div");
    card.className = "btc-card";
    card.innerHTML =
      `<div class="btc-card__title">${escapeHTML(widgetId)}</div>` +
      `<div class="btc-card__value">widget load failed</div>` +
      `<div class="btc-card__sub">${escapeHTML(String(err && err.message ? err.message : err))}</div>`;
    slotEl.appendChild(card);
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Core rule:
  // - Slot stays as the slot (<div class="btc-slot" data-widget="...">)
  // - We mount ONE root inside it: <div class="zzx-widget" data-widget-id="..."> ...widget.html...
  // - Widget scripts can now safely do Core.qs('[data-w="nodes"]', root) etc
  async function mountWidget(widgetId, slotEl, { force = false } = {}) {
    if (!slotEl) throw new Error(`No slot element for ${widgetId}`);

    // avoid double-mount unless forced
    if (!force && slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";

    // Mark loading (optional)
    slotEl.dataset.loading = "1";

    try {
      // 1) Ensure widget CSS (if the widget provides one)
      // (Some of your widget.css files are "/* none */" which is fine)
      ensureCSS(hrefWidgetCSS(widgetId), widgetId);

      // 2) Fetch + mount HTML
      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;

      // IMPORTANT: keep slot in DOM, replace its children only
      slotEl.replaceChildren(root);

      // 3) Load widget JS (once)
      // Many of your widgets are self-executing and just need their DOM present.
      await ensureJS(hrefWidgetJS(widgetId), widgetId);

      // 4) Optional convention: if a widget registers an init hook, call it.
      // Supports either:
      //   window.ZZXWidgetInit[widgetId](root, Core)
      // or
      //   window.ZZXWidgetInit(widgetId, root, Core)
      try {
        const initMap = W.ZZXWidgetInit;
        if (initMap && typeof initMap === "object" && typeof initMap[widgetId] === "function") {
          initMap[widgetId](root, W.ZZXWidgetsCore);
        } else if (typeof initMap === "function") {
          initMap(widgetId, root, W.ZZXWidgetsCore);
        }
      } catch (_) {
        // ignore init hook errors here; widget may be self-booting
      }

      return true;
    } catch (err) {
      // If anything fails, show failure UI but keep slot alive for retry
      renderLoadFailed(slotEl, widgetId, err);
      return false;
    } finally {
      slotEl.dataset.loading = "0";
    }
  }

  // Mount all slots found in a container (e.g., #btc-rail)
  async function mountAll(scope = document, { force = false } = {}) {
    const slots = qsa(".btc-slot[data-widget]", scope);
    const results = [];

    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;

      // runtime is a widget too; let it mount like others
      results.push(mountWidget(id, slot, { force }));
    }

    // wait for all mounts
    const settled = await Promise.allSettled(results);
    return settled;
  }

  // ----------------------------
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __version: "1.0.0-dropin",
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

    // widget path helpers (handy for widgets that fetch local json in their dir)
    widgetBase,
    hrefWidgetHTML,
    hrefWidgetCSS,
    hrefWidgetJS,
  };
})();
