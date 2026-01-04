/* __partials/widgets/_core/widget-core.js
   Core helpers for ZZX HUD widgets (prefix-aware, safe, idempotent).
*/
(function () {
  const W = window;
  if (W.ZZXWidgetsCore) return;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path; // already relative
    return prefix.replace(/\/+$/, "") + path;
  }

  function url(path) {
    return join(getPrefix(), path);
  }

  async function fetchText(path) {
    const r = await fetch(url(path), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return await r.text();
  }

  async function fetchJSON(path) {
    const r = await fetch(url(path), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return await r.json();
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function ensureLinkCSS(href, key) {
    const attr = `data-zzx-css-${key}`;
    if (document.querySelector(`link[${attr}="1"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    document.head.appendChild(l);
  }

  function ensureScript(src, key) {
    const attr = `data-zzx-js-${key}`;
    if (document.querySelector(`script[${attr}="1"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute(attr, "1");
    document.body.appendChild(s);
  }

  // Mount widget fragment into a slot:
  // - inject widget.css once (if exists)
  // - inject widget.js once (if exists)
  // - mount widget.html into slot
  async function mountWidget(widgetId, slotEl) {
    if (!slotEl) return false;

    // avoid double-mount
    if (slotEl.dataset.mounted === "1") return true;
    slotEl.dataset.mounted = "1";

    const base = `/__partials/widgets/${widgetId}`;
    const htmlPath = `${base}/widget.html`;
    const cssPath  = `${base}/widget.css`;
    const jsPath   = `${base}/widget.js`;

    // Try CSS (optional)
    try {
      // If css exists, link it (probe via fetch HEAD-ish GET)
      const cssUrl = url(cssPath);
      const r = await fetch(cssUrl, { method: "GET", cache: "no-store" });
      if (r.ok) ensureLinkCSS(cssUrl, `widget-${widgetId}`);
    } catch (_) {}

    // HTML is required for a widget slot to be considered “working”
    const html = await fetchText(htmlPath);

    // Wrap into a predictable root (widgets can also include their own wrappers)
    const wrap = document.createElement("div");
    wrap.className = "zzx-widget";
    wrap.setAttribute("data-widget-id", widgetId);
    wrap.setAttribute("data-widget-root", widgetId);
    wrap.innerHTML = html;

    slotEl.replaceChildren(wrap);

    // Try JS (optional)
    try {
      const jsUrl = url(jsPath);
      const r = await fetch(jsUrl, { method: "GET", cache: "no-store" });
      if (r.ok) ensureScript(jsUrl, `widget-${widgetId}`);
    } catch (_) {}

    return true;
  }

  W.ZZXWidgetsCore = {
    getPrefix,
    join,
    url,
    fetchText,
    fetchJSON,
    qs,
    qsa,
    ensureLinkCSS,
    ensureScript,
    mountWidget,
  };
})();
