// __partials/widgets/hashrate-by-nation/widget.js
// DROP-IN REPLACEMENT
// Auto-load deps from same folder so you never see "fetch.js missing".

(function(){
  "use strict";

  const ID = "hashrate-by-nation";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  const MEMPOOL = "https://mempool.space";
  const POOL_ENDPOINTS = [
    `${MEMPOOL}/api/v1/mining/pools/24h`,
    `${MEMPOOL}/api/v1/mining/pools/1d`,
    `${MEMPOOL}/api/v1/mining/pools`,
  ];
  const HASHRATE_ENDPOINT = `${MEMPOOL}/api/v1/mining/hashrate/3d`;

  function widgetBasePath(){
    const Core = window.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/hashrate-by-nation/";
  }

  async function loadScriptOnce(url, key){
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) return true;
    return await new Promise((resolve)=>{
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = ()=>resolve(true);
      s.onerror = ()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  async function ensureDeps(){
    const base = widgetBasePath();

    if (!window.ZZXHashrateNationFetch?.fetchJSON){
      const ok = await loadScriptOnce(base + "fetch.js", "zzx:hbn:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing (failed to load)" };
      if (!window.ZZXHashrateNationFetch?.fetchJSON) return { ok:false, why:"fetch.js did not register" };
    }

    // Optional modules (only required if you want the nation mapping + chart modules)
    if (!window.ZZXHashrateNationMap?.mapPool){
      const ok = await loadScriptOnce(base + "mapper.js", "zzx:hbn:mapper");
      if (!ok) return { ok:false, why:"mapper.js missing" };
      if (!window.ZZXHashrateNationMap?.mapPool) return { ok:false, why:"mapper.js did not register" };
    }
    if (!window.ZZXHashrateNationPlotter?.layout){
      const ok = await loadScriptOnce(base + "plotter.js", "zzx:hbn:plotter");
      if (!ok) return { ok:false, why:"plotter.js missing" };
      if (!window.ZZXHashrateNationPlotter?.layout) return { ok:false, why:"plotter.js did not register" };
    }
    if (!window.ZZXHashrateNationChart?.draw){
      const ok = await loadScriptOnce(base + "chart.js", "zzx:hbn:chart");
      if (!ok) return { ok:false, why:"chart.js missing" };
      if (!window.ZZXHashrateNationChart?.draw) return { ok:false, why:"chart.js did not register" };
    }

    return { ok:true };
  }

  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function pickArray(payload){
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object"){
      if (Array.isArray(payload.pools)) return payload.pools;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.results)) return payload.results;
      if (Array.isArray(payload.hashrates)) return payload.hashrates;
    }
    return [];
  }

  function normalizePools(payload){
    const rows = pickArray(payload);
    return rows.map(p => ({
      name: String(p?.name ?? p?.pool ?? p?.poolName ?? p?.slug ?? "Unknown"),
      blocks: n(p?.blocks ?? p?.blockCount ?? p?.count ?? p?.nBlocks ?? p?.blocksMined),
    })).filter(r => Number.isFinite(r.blocks) && r.blocks > 0);
  }

  function normalizeHashrate(payload){
    const rows = pickArray(payload);
    const pts = rows.map(p => ({
      hs: n(p?.hashrate ?? p?.value ?? p?.hs ?? p?.[1]),
    })).filter(p => Number.isFinite(p.hs));
    return pts;
  }

  function hsToZH(hs){ return Number.isFinite(hs) ? (hs / 1e21) : NaN; }

  async function fetchPools(){
    let lastErr = null;
    for (const url of POOL_ENDPOINTS){
      try{
        const payload = await window.ZZXHashrateNationFetch.fetchJSON(url);
        const rows = normalizePools(payload);
        if (rows.length) return { rows, source:url };
        lastErr = new Error(`no usable rows from ${url}`);
      }catch(e){
        lastErr = new Error(`${url}: ${String(e?.message || e)}`);
      }
    }
    throw lastErr || new Error("no pool endpoint succeeded");
  }

  async function fetchGlobalHashrate(){
    const payload = await window.ZZXHashrateNationFetch.fetchJSON(HASHRATE_ENDPOINT);
    const pts = normalizeHashrate(payload);
    if (!pts.length) throw new Error("hashrate series empty");
    const last = pts[pts.length - 1];
    const globalZH = hsToZH(last.hs);
    if (!Number.isFinite(globalZH)) throw new Error("global hashrate missing");
    return { globalZH, source: HASHRATE_ENDPOINT };
  }

  async function run(root){
    const sub = root.querySelector("[data-hbn-sub]");
    const svg = root.querySelector("[data-hbn-svg]");

    const deps = await ensureDeps();
    if (!deps.ok){
      if (sub) sub.textContent = `error: ${deps.why}`;
      return;
    }

    try{
      if (sub) sub.textContent = "loading…";

      const [pools, hr] = await Promise.all([ fetchPools(), fetchGlobalHashrate() ]);

      // Aggregate blocks -> nation via mapper
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
          hashrateZH: (blocks / totalBlocks) * hr.globalZH,
        }))
        .sort((a,b)=>b.hashrateZH - a.hashrateZH)
        .slice(0, 10);

      const layout = window.ZZXHashrateNationPlotter.layout(rows);
      window.ZZXHashrateNationChart.draw(svg, layout);

      if (sub) sub.textContent = "Source: mempool.space (pools + hashrate) · hashrate-by-nation is estimated";
    }catch(e){
      const msg = String(e?.message || e);
      if (sub) sub.textContent = `error: ${msg}`;
      if (DEBUG) console.warn("[hashrate-by-nation]", e);
    }
  }

  function boot(root){
    if (!root) return;

    // prevent duplicate timers on reinjection
    if (root.__zzxHbnTimer){
      clearInterval(root.__zzxHbnTimer);
      root.__zzxHbnTimer = null;
    }

    run(root);
    root.__zzxHbnTimer = setInterval(()=>run(root), 60_000);
  }

  if (window.ZZXWidgetsCore?.onMount){
    window.ZZXWidgetsCore.onMount(ID, boot);
  } else if (window.ZZXWidgets?.register){
    window.ZZXWidgets.register(ID, (root)=>boot(root));
  }
})();
