// __partials/widgets/_core/widget-core.js
(function () {
  if (window.ZZXWidgetsCore) return;

  const Core = {};
  const DEBUG = !!window.__ZZX_WIDGETS_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX-WIDGETS]", ...a);

  Core.getPrefix = function () {
    const p = window.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  };

  Core.join = function (prefix, absPath) {
    if (!absPath) return absPath;
    if (prefix === "/" || absPath.startsWith("http://") || absPath.startsWith("https://")) return absPath;
    if (!absPath.startsWith("/")) return absPath;
    return prefix.replace(/\/+$/, "") + absPath;
  };

  Core.ensureCSS = function (href, key) {
    const attr = `data-zzx-css-${key}`;
    if (document.querySelector(`link[${attr}="1"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    document.head.appendChild(l);
  };

  Core.ensureJS = function (src, key) {
    const attr = `data-zzx-js-${key}`;
    if (document.querySelector(`script[${attr}="1"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute(attr, "1");
    document.body.appendChild(s);
  };

  Core.fetchText = async function (url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  };

  Core.fetchJSON = async function (url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  };

  // per-widget in-flight locks (prevents stampede)
  const inflight = Object.create(null);
  Core.lock = function (k) { if (inflight[k]) return false; inflight[k] = true; return true; };
  Core.unlock = function (k) { inflight[k] = false; };

  // stable interval registry (so reinjection doesn’t duplicate timers)
  const timers = [];
  Core.setIntervalOnce = function (fn, ms) {
    const id = setInterval(fn, ms);
    timers.push(id);
    return id;
  };
  Core.clearAllIntervals = function () {
    while (timers.length) clearInterval(timers.pop());
  };

  Core.log = log;

  window.ZZXWidgetsCore = Core;
})();
