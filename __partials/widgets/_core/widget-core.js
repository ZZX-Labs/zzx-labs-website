// __partials/widgets/_core/widget-core.js
// Shared helpers that widget scripts rely on.
// Exposes: window.ZZXWidgetsCore

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

  function url(path) {
    return join(getPrefix(), path);
  }

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  async function tget(href, opts) {
    const r = await fetch(href, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`${href} HTTP ${r.status}`);
    return await r.text();
  }

  async function jget(href, opts) {
    const r = await fetch(href, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`${href} HTTP ${r.status}`);
    return await r.json();
  }

  function fmtUSD(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    const abs = Math.abs(x);
    const sign = x < 0 ? "-" : "";
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(2) + "K";
    return sign + abs.toFixed(2);
  }

  function setCard(rootOrId, valueText, subText) {
    const card = (typeof rootOrId === "string") ? byId(rootOrId) : rootOrId;
    if (!card) return false;
    const v = qs("[data-val]", card) || qs(".zzx-card__value [data-val]", card) || qs(".btc-card__value [data-val]", card);
    const s = qs("[data-sub]", card) || qs(".zzx-card__sub [data-sub]", card) || qs(".btc-card__sub [data-sub]", card);
    if (v) v.textContent = (valueText ?? "—");
    if (s && subText != null) s.textContent = subText;
    return true;
  }

  // Simple widget root finder used by many widget.js patterns
  function widgetRoot(id) {
    // runtime wraps widgets in <div class="zzx-widget" data-widget-id="...">
    return qs(`.zzx-widget[data-widget-id="${CSS.escape(id)}"]`);
  }

  // Debug helper
  const DEBUG = !!W.__ZZX_BTC_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX-Core]", ...a);
  const warn = (...a) => DEBUG && console.warn("[ZZX-Core]", ...a);

  W.ZZXWidgetsCore = {
    getPrefix, join, url,
    qs, qsa, byId,
    tget, jget,
    fmtUSD, fmtBig,
    setCard,
    widgetRoot,
    log, warn
  };

  log("core loaded");
})();
