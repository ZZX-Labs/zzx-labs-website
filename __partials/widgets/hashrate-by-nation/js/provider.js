// __partials/widgets/hashrate-by-nation/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateNationProvider?.__version>=3)return;

  async function localRegistry(core){
    const path="/__partials/widgets/hashrate-by-nation/hashrate-by-nation.json";
    const url=core?.ctx?.urlFor
      ? core.ctx.urlFor(path)
      : W.ZZXAPI?.url
        ? W.ZZXAPI.url(path)
        : path;

    try{
      if(W.ZZXAPI?.jsonStrict){
        return await W.ZZXAPI.jsonStrict(url,{
          cacheBust:true,
          timeoutMs:8000,
          retries:1
        });
      }

      const r=await fetch(url,{cache:"no-store",credentials:"same-origin"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(_){
      return null;
    }
  }

  function globalHashrateEH(){
    const values=[
      W.ZZXMiningStats?.globalHashrateEH,
      W.ZZXMiningStats?.globalHashrateZH != null
        ? Number(W.ZZXMiningStats.globalHashrateZH)*1000
        : NaN
    ];

    for(const value of values){
      const n=Number(value);
      if(Number.isFinite(n)&&n>0)return n;
    }

    return NaN;
  }

  async function countryRowsFromBitnodes(){
    if(!W.ZZXBitnodesData?.aggregate)return [];

    try{
      const agg=await W.ZZXBitnodesData.aggregate();
      const rows=
        agg?.top?.countries ||
        agg?.countries ||
        [];

      if(Array.isArray(rows)&&rows.length)return rows;
    }catch(_){}

    return [];
  }

  function countryRowsFromGlobal(){
    const src=W.ZZXNodesByNation;

    if(src?.byNation&&typeof src.byNation==="object"){
      return Object.entries(src.byNation).map(([iso,value])=>({
        iso,
        name:value?.country||value?.name||iso,
        count:Number(value?.nodes)
      }));
    }

    if(src?.shares&&typeof src.shares==="object"){
      return Object.entries(src.shares).map(([iso,share])=>({
        iso,
        name:iso,
        count:Number(share)
      }));
    }

    return [];
  }

  async function load(core){
    const globalEH=globalHashrateEH();
    if(!(globalEH>0))throw new Error("waiting for global hashrate widget/provider");

    const registry=await localRegistry(core);
    const direct=W.ZZXHashrateNationModel.normalizeShares(
      registry?.shares,
      "local country-share registry"
    );

    if(direct.length){
      return {
        model:W.ZZXHashrateNationModel.allocate(
          globalEH,
          direct,
          "local mining-share estimate",
          10
        ),
        updated:registry?.updated_at||null,
        source:"hashrate-by-nation.json"
      };
    }

    const bitnodesRows=await countryRowsFromBitnodes();
    const proxyRows=W.ZZXHashrateNationModel.fromCountryCounts(
      bitnodesRows.length ? bitnodesRows : countryRowsFromGlobal()
    );

    if(!proxyRows.length){
      throw new Error("no country mining-share data or node-geography proxy data available");
    }

    return {
      model:W.ZZXHashrateNationModel.allocate(
        globalEH,
        proxyRows,
        "node-geography proxy",
        10
      ),
      updated:new Date().toISOString(),
      source:bitnodesRows.length
        ? "ZZXBitnodesData.aggregate().top.countries"
        : "ZZXNodesByNation"
    };
  }

  W.ZZXHashrateNationProvider=Object.freeze({
    __version:3,
    load
  });
})();
