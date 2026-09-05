// __partials/widgets/mempool-goggles/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolGogglesSources?.__version>=1)return;

  function normalizeBase(value){
    return String(value||"").trim().replace(/\/+$/g,"");
  }

  function bases(core){
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

  W.ZZXMempoolGogglesSources=Object.freeze({
    __version:1,
    bases,
    refreshMs:10000,
    candidateVbytes:1_000_000,
    maxTiles:1200,
    price:W.ZZXAPI?.url
      ? W.ZZXAPI.url("/bitcoin/bpi/api/latest.json")
      : "/bitcoin/bpi/api/latest.json"
  });
})();
