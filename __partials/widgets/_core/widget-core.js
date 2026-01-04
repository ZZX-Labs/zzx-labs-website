// __partials/widgets/_core/widget-core.js
// Minimal, reliable widget runtime helpers: prefix-aware fetch, mount callbacks, css/js inject once.

(function () {
  const W = window;
  if (W.ZZXWidgetsCore) return;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(path) {
    const p = getPrefix();
    if (!path) return path;
    if (p === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return p.replace(/\/+$/, "") + path;
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }

  function ensureCSS(href, key) {
    const id = `zzx-css-${key || href}`;
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const id = `zzx-js-${key || src}`;
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  }

  // ---------- mount callbacks ----------
  const mountCbs = new Map();   // id -> [fn]
  const mountedOnce = new Set(); // id -> token string

  function widgetRoot(id) {
    return qs(`[data-widget-root="${id}"]`);
  }

  function onMount(id, fn) {
    if (!mountCbs.has(id)) mountCbs.set(id, []);
    mountCbs.get(id).push(fn);

    // If already mounted, run immediately
    const root = widgetRoot(id);
    if (root) safeRun(fn, root);
  }

  function safeRun(fn, root) {
    try { fn(root); } catch (e) { console.warn(`[ZZXWidgets] ${root?.dataset?.widgetRoot || "widget"} init`, e); }
  }

  function notifyMount(id) {
    const root = widgetRoot(id);
    if (!root) return;
    const tok = root.dataset.__tok || (root.dataset.__tok = String(Date.now() + Math.random()));
    if (mountedOnce.has(`${id}:${tok}`)) return;
    mountedOnce.add(`${id}:${tok}`);

    const list = mountCbs.get(id) || [];
    list.forEach(fn => safeRun(fn, root));
  }

  // Watch DOM for injected widget HTML
  const mo = new MutationObserver(() => {
    // any widget root that exists should notify
    qsa("[data-widget-root]").forEach(el => {
      const id = el.getAttribute("data-widget-root");
      if (id) notifyMount(id);
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  W.ZZXWidgetsCore = {
    getPrefix,
    join,
    qs,
    qsa,
    fetchText,
    fetchJSON,
    ensureCSS,
    ensureJS,
    onMount,
    notifyMount
  };
})();
