// __partials/widgets/_core/widget-core.js
(function () {
  if (window.ZZXWidgetsCore) return;

  function getPrefix() {
    const p = window.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  async function jget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }
  async function tget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  function fmtBig(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(2) + "K";
    return sign + abs.toFixed(2);
  }

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const api = {
    getPrefix,
    join,
    jget,
    tget,
    fmtBig,
    fmtUSD,

    widgetBase(id) {
      return join(getPrefix(), `/__partials/widgets/${id}`);
    },

    async fetchWidgetHTML(id) {
      return await tget(`${this.widgetBase(id)}/widget.html`);
    },
    async fetchWidgetCSS(id) {
      return await tget(`${this.widgetBase(id)}/widget.css`);
    },
    async fetchLocalJSON(id, filename) {
      return await jget(`${this.widgetBase(id)}/${filename}`);
    },

    ensureStyleTag(id, cssText) {
      const key = `style[data-zzx-widget-css="${id}"]`;
      if (document.querySelector(key)) return;
      const st = document.createElement("style");
      st.setAttribute("data-zzx-widget-css", id);
      st.textContent = cssText || "";
      document.head.appendChild(st);
    },

    ensureScriptTag(id) {
      const key = `script[data-zzx-widget-js="${id}"]`;
      if (document.querySelector(key)) return;
      const s = document.createElement("script");
      s.src = `${this.widgetBase(id)}/widget.js`;
      s.defer = true;
      s.setAttribute("data-zzx-widget-js", id);
      document.body.appendChild(s);
    },

    mountToken(el) {
      if (!el) return "";
      if (!el.dataset.zzxTok) el.dataset.zzxTok = String(Date.now() + Math.random());
      return el.dataset.zzxTok;
    }
  };

  window.ZZXWidgetsCore = api;
})();
