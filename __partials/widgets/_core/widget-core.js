// __partials/widgets/_core/widget-core.js
(function () {
  const W = window;

  function getPrefix() {
    return (typeof W.ZZX?.PREFIX === "string" && W.ZZX.PREFIX.length) ? W.ZZX.PREFIX : ".";
  }

  function join(prefix, path) {
    // If no leading slash, leave as-is.
    if (!path) return path;
    if (!path.startsWith("/")) return path;

    // If hosted at root, absolute is already correct.
    if (prefix === "/" || prefix === "") return path;

    // Prefix + absolute
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

  async function fetchAllOriginsText(targetUrl) {
    const ao = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const r = await fetch(ao, { cache: "no-store" });
    if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
    return await r.text();
  }

  function htmlToFragment(html) {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
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
