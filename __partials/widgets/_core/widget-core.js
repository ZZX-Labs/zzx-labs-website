// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core (prefix-aware URLs + safe inject helpers)

(function () {
  if (window.ZZXWidgetsCore) return;

  const W = window;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function asset(path) {
    return join(getPrefix(), path);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return await r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return await r.json();
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function ensureStyleOnce(key, cssText) {
    const id = `zzx-style-${key}`;
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = cssText || "";
    document.head.appendChild(st);
  }

  function ensureLinkOnce(key, href) {
    const sel = `link[data-zzx-link="${key}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-link", key);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const sel = `script[data-zzx-script="${key}"]`;
    const existing = document.querySelector(sel);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-script", key);
      s.onload = () => resolve(s);
      s.onerror = () => reject(new Error(`Failed script: ${src}`));
      document.body.appendChild(s);
    });
  }

  W.ZZXWidgetsCore = {
    getPrefix, join, asset,
    fetchText, fetchJSON,
    qs, qsa,
    ensureStyleOnce, ensureLinkOnce, ensureScriptOnce,
  };
})();
