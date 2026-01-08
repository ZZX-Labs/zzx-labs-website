// __partials/widgets/hashrate-by-nation/widget.js
// DROP-IN REPLACEMENT
// - Robust normalization for mempool payload shapes
// - Multiple pool endpoints (24h/1d/fallback)
// - Shows actual failure detail in subline

(function(){
  "use strict";

  const ID = "hashrate-by-nation";

  const MEMPOOL = "https://mempool.space";

  // Try these in order (mempool has shipped variants over time)
  const POOL_ENDPOINTS = [
    `${MEMPOOL}/api/v1/mining/pools/24h`,
    `${MEMPOOL}/api/v1/mining/pools/1d`,
    `${MEMPOOL}/api/v1/mining/pools`,
  ];

  // Typically returns series (3d) with hourly-ish points
  const HASHRATE_ENDPOINT = `${MEMPOOL}/api/v1/mining/hashrate/3d`;

  function n(x){
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function pickPools(payload){
    // Accept: array, {pools:[]}, {data:[]}, {items:[]}
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object"){
      if (Array.isArray(payload.pools)) return payload.pools;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.results)) return payload.results;
    }
    return [];
  }

  function normalizePools(payload){
    const rows = pickPools(payload);
    return rows.map(p => ({
      name: String(p?.name ?? p?.pool ?? p?.poolName ?? p?.slug ?? "Unknown"),
      blocks: n(p?.blocks ?? p?.blockCount ?? p?.count ?? p?.nBlocks ?? p?.blocksMined),
      share: n(p?.share ?? p?.sharePercent ?? p?.ratio),
    })).filter(r => Number.isFinite(r.blocks) && r.blocks > 0);
  }

  function normalizeHashrate(payload){
    // Accept: array of {timestamp, hashrate}, or {hashrates:[...]}, etc.
    let arr = payload;

    if (!Array.isArray(arr) && payload && typeof payload === "object"){
      if (Array.isArray(payload.hashrates)) arr = payload.hashrates;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.items)) arr = payload.items;
      else if (Array.isArray(payload.results)) arr = payload.results;
    }

    const pts = (Array.isArray(arr) ? arr : []).map(p => ({
      t: n(p?.timestamp ?? p?.time ?? p?.t ?? p?.[0]),
      hs: n(p?.hashrate ?? p?.value ?? p?.hs ?? p?.[1]),
    })).filter(p => Number.isFinite(p.hs));

    return pts;
  }

  function hsToZH(hs){
    return Number.isFinite(hs) ? (hs / 1e21) : NaN;
  }

  async function fetchPools(){
    let lastErr = null;

    for (const url of POOL_ENDPOINTS){
      try{
        const payload = await window.ZZXHashrateNationFetch.fetchJSON(url);
        const rows = normalizePools(payload);

        if (rows.length){
          return { rows, source: url };
        }

        // If payload parsed but shape unexpected, keep searching
        lastErr = new Error(`no usable rows from ${url}`);
      }catch(e){
        lastErr = new Error(`${url}: ${String(e?.message || e)}`);
      }
    }

    throw lastErr || new Error("no pool endpoint succeeded");
  }

  async function fetchHashrate(){
    const payload = await window.ZZXHashrateNationFetch.fetchJSON(HASHRATE_ENDPOINT);
    const pts = normalizeHashrate(payload);
    if (!pts.length) throw new Error("hashrate series empty");
    const last = pts[pts.length - 1];
    const globalZH = hsToZH(last.hs);
    if (!Number.isFinite(globalZH)) throw new Error("global hashrate missing");
    return { globalZH, source: HASHRATE_ENDPOINT };
  }

  async function boot(root){
    const sub = root.querySelector("[data-hbn-sub]");
    const svg = root.querySelector("[data-hbn-svg]");

    try{
      // sanity: required modules present
      if (!window.ZZXHashrateNationFetch?.fetchJSON) throw new Error("fetch.js missing");
      if (!window.ZZXHashrateNationMap?.mapPool) throw new Error("mapper.js missing");
      if (!window.ZZXHashrateNationPlotter?.layout) throw new Error("plotter.js missing");
      if (!window.ZZXHashrateNationChart?.draw) throw new Error("chart.js missing");

      sub.textContent = "loading…";

      const [pools, hr] = await Promise.all([ fetchPools(), fetchHashrate() ]);

      const nationAgg = {};
      for (const p of pools.rows){
        const iso = window.ZZXHashrateNationMap.mapPool(p.name) || "Other";
        nationAgg[iso] = (nationAgg[iso] || 0) + p.blocks;
      }

      const totalBlocks = Object.values(nationAgg).reduce((a,b)=>a+b,0);
      if (!totalBlocks) throw new Error("totalBlocks=0");

      const rows = Object.entries(nationAgg)
        .map(([iso, blocks]) => ({
          iso,
          blocks,
          share: blocks / totalBlocks,
          hashrateZH: (blocks / totalBlocks) * hr.globalZH
        }))
        .sort((a,b)=>b.hashrateZH - a.hashrateZH)
        .slice(0, 10);

      const layout = window.ZZXHashrateNationPlotter.layout(rows);
      window.ZZXHashrateNationChart.draw(svg, layout);

      sub.textContent = `Source: mempool pools + hashrate (estimate)`;
    }catch(e){
      const msg = String(e?.message || e);
      sub.textContent = `error: ${msg}`;
    }
  }

  if (window.ZZXWidgetsCore?.onMount){
    window.ZZXWidgetsCore.onMount(ID, boot);
  } else if (window.ZZXWidgets?.register){
    window.ZZXWidgets.register(ID, (root)=>boot(root));
  }
})();
