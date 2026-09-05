// __partials/widgets/difficulty-adjustment/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXDifficultyProvider?.__version >= 1) return;

  function bases(core) {
    const normalize = v => String(v || "").trim().replace(/\/+$/g, "");
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalize).filter(Boolean))];
  }

  async function getJSON(url) {
    if (W.ZZXAPI?.fetchRaw) {
      const r = await W.ZZXAPI.fetchRaw(url, {
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r = await fetch(url, { cache:"no-store", credentials:"omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function load(core) {
    let lastError = null;

    for (const base of bases(core)) {
      try {
        return {
          data: await getJSON(`${base}/v1/difficulty-adjustment`),
          base
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("difficulty-adjustment API unavailable");
  }

  W.ZZXDifficultyProvider = Object.freeze({
    __version:1,
    load
  });
})();
