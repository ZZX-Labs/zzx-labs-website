// __partials/widgets/_core/widget-core.js
(function () {
  const W = window;
  if (W.ZZXWidgetsCore) return;

  // ---------------- DOM helpers ----------------
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  // ---------------- Prefix helpers ----------------
  function getPrefix() {
    // partials-loader sets window.ZZX.PREFIX = "." | ".." | "../.." | "/" etc
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function prefixBase() {
    // returns "" for root hosting, or "<prefix-without-trailing-slash>" for GH pages/subpaths
    const p = getPrefix();
    if (p === "/") return "";                 // absolute root hosting
    if (p === ".") return "";                 // same directory; "/x" is still root, so we must NOT rewrite in this case
    return p.replace(/\/+$/, "");             // "../.." etc
  }

  function join(prefix, path) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (prefix === "/" || prefix === ".") return path; // leave as-is
    if (!path.startsWith("/")) return path;            // already relative
    return prefix.replace(/\/+$/, "") + path;
  }

  // ---------------- CRITICAL FIX: fetch shim ----------------
  // Rewrite site-absolute paths ("/static/...", "/__partials/...") into prefix-aware paths
  // so widgets work from any depth without editing their code.
  function installFetchShim() {
    if (W.__ZZX_FETCH_SHIM_INSTALLED) return;
    W.__ZZX_FETCH_SHIM_INSTALLED = true;

    const origFetch = W.fetch.bind(W);
    W.__ZZX_FETCH_ORIG = W.__ZZX_FETCH_ORIG || origFetch;

    function rewriteURL(u) {
      // Only rewrite same-origin absolute-path URLs that start with "/"
      if (typeof u !== "string") return u;
      if (!u.startsWith("/")) return u;

      const base = prefixBase();
      // If base is "", we are at root OR prefix "." -> do nothing
      if (!base) return u;

      // Prevent double-prefixing
      if (u.startsWith(base + "/")) return u;

      // Rewrite "/x/y" -> "<base>/x/y"
      return base + u;
    }

    W.fetch = function (input, init) {
      try {
        // fetch("...") string
        if (typeof input === "string") {
          return origFetch(rewriteURL(input), init);
        }

        // fetch(new Request("..."))
        if (input && typeof input === "object" && "url" in input) {
          const url = String(input.url || "");
          // Only rewrite same-origin absolute-path requests
          // If the request URL is already absolute http(s), leave it.
          if (url.startsWith("/") && !url.startsWith("//")) {
            const rewritten = rewriteURL(url);
            if (rewritten !== url) {
              const req = new Request(rewritten, input);
              return origFetch(req, init);
            }
          }
          return origFetch(input, init);
        }

        return origFetch(input, init);
      } catch (e) {
        // Fail open: if something odd happens, use original fetch
        return origFetch(input, init);
      }
    };

    // Expose helper so widgets *can* use it, but they don't have to.
    W.__ZZX_URL = rewriteURL;
  }

  installFetchShim();

  // ---------------- Network helpers ----------------
  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  // ---------------- Asset injection ----------------
  function ensureCSS(href, key) {
    const id = `zzx-css:${key}`;
    if (document.querySelector(`link[data-zzx-asset="${id}"]`)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-asset", id);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const id = `zzx-js:${key}`;
    if (document.querySelector(`script[data-zzx-asset="${id}"]`)) return;

    const s = document.createElement("script");
    s.src = src;
    // dynamic script: "defer" doesn't behave like parser-defer; use async and rely on widget rebind patterns
    s.async = true;
    s.setAttribute("data-zzx-asset", id);
    document.body.appendChild(s);
  }

  // ---------------- Widget mounting ----------------
  async function mountWidget(widgetId, slotEl) {
    if (!widgetId || !slotEl) return false;

    // Already mounted and has content
    if (slotEl.dataset.mounted === "1" && slotEl.innerHTML.trim().length) return true;

    // Avoid overlap
    if (slotEl.dataset.mounting === "1") return false;
    slotEl.dataset.mounting = "1";

    const prefix = getPrefix();
    const base = join(prefix, `/__partials/widgets/${widgetId}`);

    const htmlURL = `${base}/widget.html`;
    const cssURL  = `${base}/widget.css`;
    const jsURL   = `${base}/widget.js`;

    try {
      // Inject CSS early
      ensureCSS(cssURL, `widget:${widgetId}`);

      // Load HTML
      const html = await fetchText(htmlURL);

      // Wrap
      const wrap = document.createElement("div");
      wrap.className = "zzx-widget";
      wrap.setAttribute("data-widget-id", widgetId);
      wrap.innerHTML = html;

      // Mount
      slotEl.innerHTML = "";
      slotEl.appendChild(wrap);

      // Load JS once (widgets should rebind safely when their DOM exists)
      ensureJS(jsURL, `widget:${widgetId}`);

      // Mark mounted only after success
      slotEl.dataset.mounted = "1";

      // Emit a mount event so any widget controllers that listen can rebind
      try {
        window.dispatchEvent(new CustomEvent("zzx:widget-mounted", { detail: { id: widgetId } }));
      } catch (_) {}

      return true;
    } catch (e) {
      // rollback so runtime retries work
      slotEl.dataset.mounted = "0";
      slotEl.innerHTML = "";
      console.warn(`[ZZXWidgets] mount failed for ${widgetId}:`, e);
      return false;
    } finally {
      slotEl.dataset.mounting = "0";
    }
  }

  async function mountAllFromDOM(root = document) {
    const slots = qsa(".btc-slot[data-widget]", root);
    let okCount = 0;
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      const ok = await mountWidget(id, slot);
      if (ok) okCount++;
    }
    return okCount;
  }

  // Public core
  W.ZZXWidgetsCore = {
    qs, qsa,
    getPrefix, join,
    ensureCSS, ensureJS,
    fetchText,
    mountWidget,
    mountAllFromDOM,
    url: (u) => (typeof W.__ZZX_URL === "function" ? W.__ZZX_URL(u) : u),
  };
})();
