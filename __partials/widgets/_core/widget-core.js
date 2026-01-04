// __partials/widgets/_core/widget-core.js
// Minimal core helpers + widget loader utilities.

(function () {
  if (window.ZZXWidgetsCore) return;

  const Core = {
    qs(sel, root = document) { return root.querySelector(sel); },
    qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

    join(prefix, path) {
      if (!path) return path;
      if (prefix === "/" || /^https?:\/\//i.test(path)) return path;
      if (!path.startsWith("/")) return path;
      return String(prefix || ".").replace(/\/+$/, "") + path;
    },

    getPrefix() {
      const p = window.ZZX?.PREFIX;
      return (typeof p === "string" && p.length) ? p : ".";
    },

    async fetchText(url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.text();
    },

    async fetchJSON(url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    },

    ensureCSS(href, key) {
      const attr = `data-zzx-css-${key}`;
      if (document.querySelector(`link[${attr}="1"]`)) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.setAttribute(attr, "1");
      document.head.appendChild(l);
    },

    ensureJS(src, key) {
      const attr = `data-zzx-js-${key}`;
      if (document.querySelector(`script[${attr}="1"]`)) return;
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute(attr, "1");
      document.body.appendChild(s);
    }
  };

  window.ZZXWidgetsCore = Core;
})();
