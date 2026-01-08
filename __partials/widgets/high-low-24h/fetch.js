// __partials/widgets/high-low-24h/fetch.js
// DROP-IN (module)
// Exposes: window.ZZXFetchHL.json(url, { ctx, signal })

(function () {
  "use strict";

  const W = window;
  const AO_RAW = "https://api.allorigins.win/raw?url=";
  const ao = (u)=> AO_RAW + encodeURIComponent(String(u));

  async function json(url, { ctx = null, signal } = {}) {
    if (ctx?.fetchJSON) return await ctx.fetchJSON(url, { signal });
    if (W.ZZXAO?.json) return await W.ZZXAO.json(url, { signal });

    const r = await fetch(ao(url), { cache:"no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  W.ZZXFetchHL = W.ZZXFetchHL || {};
  W.ZZXFetchHL.json = json;
})();
