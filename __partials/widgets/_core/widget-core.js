// __partials/widgets/_core/widget-core.js
// DROP-IN REPLACEMENT (global fix)
// Purpose: stop breaking every widget when hosted under a subpath (GH Pages / nested routes)
// by making ALL absolute fetches + asset URLs prefix-aware WITHOUT editing each widget.
//
// What this does:
//  - exposes window.ZZXWidgetsCore (qs/qsa/fetchJSON/etc) as before
//  - adds Core.abs("/...") => "<PREFIX>/..." when PREFIX !== "/" (or "." / ".." etc)
//  - PATCHES window.fetch so ANY widget calling fetch("/something") automatically becomes
//        fetch("<PREFIX>/something")
//    (only when PREFIX is not "/" and the URL is site-absolute)
//  - injects @font-face at runtime with prefix-aware URLs (fixes /static/fonts 404s on GH Pages)

(function () {
  const W = window;

  // Avoid double-definitions across reinjections
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__version) return;

  // ----------------------------
  // Prefix helpers
  // ----------------------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function isAbsSitePath(u) {
    return typeof u === "string" && u.startsWith("/") && !u.startsWith("//");
  }

  function join(prefix, path) {
    if (!path) return path;
    if (typeof path !== "string") return path;

    // Already absolute URL (http/https)
    if (/^https?:\/\//i.test(path)) return path;

    // If hosted at domain root, keep site-absolute paths unchanged
    if (prefix === "/") return path;

    // Already relative
    if (!path.startsWith("/")) return path;

    // Prefix + site-absolute path
    return prefix.replace(/\/+$/, "") + path;
  }

  // Public: make any "/x/y" safe under PREFIX
  function abs(pathAbs) {
    return join(getPrefix(), pathAbs);
  }

  // ----------------------------
  // Fetch helpers
  // ----------------------------
  async function fetchText(url, opts = {}) {
    const u = typeof url === "string" ? abs(url) : url;
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${typeof u === "string" ? u : "(request)"}`);
    return await r.text();
  }

  async function fetchJSON(url, opts = {}) {
    const u = typeof url === "string" ? abs(url) : url;
    const r = await fetch(u, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${typeof u === "string" ? u : "(request)"}`);
    return await r.json();
  }

  // ----------------------------
  // DOM helpers
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

  // ----------------------------
  // Widget path helpers
  // ----------------------------
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

  // ----------------------------
  // Runtime-injected fonts (prefix-safe)
  // ----------------------------
  function ensureFonts() {
    if (document.querySelector('style[data-zzx-fonts="1"]')) return;

    const prefix = getPrefix();
    const font1 = join(prefix, "/static/fonts/Adult-Swim-Font.ttf");
    const font2 = join(prefix, "/static/fonts/IBMPlexMono-Regular.ttf");

    const st = document.createElement("style");
    st.setAttribute("data-zzx-fonts", "1");
    st.textContent = `
@font-face{
  font-family:'AdultSwimFont';
  src:url('${font1}') format('truetype');
  font-display:swap;
}
@font-face{
  font-family:'IBMPlexMono';
  src:url('${font2}') format('truetype');
  font-display:swap;
}`.trim();
    document.head.appendChild(st);
  }

  // ----------------------------
  // Fetch patch (THIS IS THE GLOBAL FIX)
  // ----------------------------
  function patchFetchOnce() {
    if (W.__ZZX_FETCH_PATCHED) return;
    W.__ZZX_FETCH_PATCHED = true;

    const nativeFetch = W.fetch.bind(W);

    W.fetch = function patchedFetch(input, init) {
      try {
        // If widgets call fetch("/something"), rewrite to "<PREFIX>/something"
        if (typeof input === "string") {
          if (isAbsSitePath(input)) {
            input = abs(input);
          }
        } else if (input && typeof input === "object" && "url" in input) {
          // Request object: clone with rewritten URL if needed
          const url = String(input.url || "");
          if (isAbsSitePath(url)) {
            const fixed = abs(url);
            input = new Request(fixed, input);
          }
        }
      } catch (_) {
        // fall through to native
      }
      return nativeFetch(input, init);
    };
  }

  // ----------------------------
  // Widget mounting (kept compatible)
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
      // Widget CSS (deduped)
      ensureCSS(hrefWidgetCSS(widgetId), `w:${widgetId}`);

      // HTML
      const html = await fetchText(hrefWidgetHTML(widgetId));
      const root = mkWidgetRoot(widgetId);
      root.innerHTML = html;
      slotEl.replaceChildren(root);

      // JS (deduped)
      await ensureJS(hrefWidgetJS(widgetId), `w:${widgetId}`);

      // Optional init hook convention (non-breaking)
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
    const jobs = [];
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      if (!id) continue;
      jobs.push(mountWidget(id, slot, { force }));
    }
    return await Promise.allSettled(jobs);
  }

  // ----------------------------
  // Boot core
  // ----------------------------
  patchFetchOnce();
  ensureFonts();

  W.ZZXWidgetsCore = {
    __version: "1.1.0-dropin",
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
