// __partials/widgets/fees/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXFeesSources?.__version>=2)return;

  function normalizeBase(value){
    return String(value||"").trim().replace(/\/+$/g,"");
  }

  function mempoolBases(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  const units=Object.freeze([
    {id:"sat",label:"sat/vB"},
    {id:"btc",label:"BTC/vB"},
    {id:"msat",label:"msat/vB"},
    {id:"usat",label:"μsat/vB"}
  ]);

  W.ZZXFeesSources=Object.freeze({
    __version:2,
    mempoolBases,
    units,
    price:"/bitcoin/bpi/api/latest.json",
    refreshMs:60000
  });
})();
