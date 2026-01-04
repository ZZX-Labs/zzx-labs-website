// __partials/widgets/_core/widget-core.js
(function () {
  const W = window;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || /^https?:\/\//.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function onceTag(selector) {
    return !!document.querySelector(selector);
  }

  function ensureCSS(href, key) {
    const sel = `link[data-zzx-css="${key}"]`;
    if (onceTag(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const sel = `script[data-zzx-js="${key}"]`;
    if (onceTag(sel)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-js", key);
    document.body.appendChild(s);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  W.ZZXWidgetsCore = Object.assign({}, W.ZZXWidgetsCore || {}, {
    getPrefix,
    join,
    ensureCSS,
    ensureJS,
    fetchText,
    fetchJSON,
    qs,
    qsa,
  });
})();
