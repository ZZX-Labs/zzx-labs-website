// __partials/widgets/_core/widget-core.js
(function () {
  const W = window;

  function getPrefix() {
    return (typeof W.ZZX?.PREFIX === "string" && W.ZZX.PREFIX.length) ? W.ZZX.PREFIX : ".";
  }
  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
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

  // Safe HTML injection container → DOM nodes
  function htmlToFragment(html) {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  }

  // AllOrigins raw proxy (for RSS/HTML where needed)
  async function fetchAllOriginsText(targetUrl) {
    const ao = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const r = await fetch(ao, { cache: "no-store" });
    if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
    return await r.text();
  }

  W.ZZXWidgetsCore = {
    getPrefix,
    join,
    fetchText,
    fetchJSON,
    fetchAllOriginsText,
    htmlToFragment
  };
})();
