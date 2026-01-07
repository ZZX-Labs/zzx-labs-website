// __partials/widgets/volume-24h/fetch.js
// DROP-IN (module)
// Provides: window.ZZXFetchVolume.json(url, { ctx, signal })
//          window.ZZXFetchVolume.text(url, { ctx, signal })
//
// Rules:
// - Prefer ctx.fetchJSON / ctx.fetchText when available.
// - Else use AllOrigins RAW proxy (no-store).
// - Abort-safe (signal passthrough).

(function () {
  "use strict";

  const W = window;
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function ao(u){ return AO_RAW + encodeURIComponent(String(u)); }

  async function json(url, { ctx = null, signal } = {}) {
    if (ctx?.fetchJSON) return await ctx.fetchJSON(url, { signal });
    if (W.ZZXAO?.json) return await W.ZZXAO.json(url, { signal });

    const r = await fetch(ao(url), { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function text(url, { ctx = null, signal } = {}) {
    if (ctx?.fetchText) return await ctx.fetchText(url, { signal });
    if (W.ZZXAO?.text) return await W.ZZXAO.text(url, { signal });

    const r = await fetch(ao(url), { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  W.ZZXFetchVolume = W.ZZXFetchVolume || {};
  W.ZZXFetchVolume.json = json;
  W.ZZXFetchVolume.text = text;
})();
