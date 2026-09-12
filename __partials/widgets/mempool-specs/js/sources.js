// __partials/widgets/mempool-specs/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsSources?.__version>=5)return;

  const normalize=v=>String(v||"").trim().replace(/\/+$/g,"");
  const join=(base,path)=>normalize(base)+"/"+String(path||"").replace(/^\/+/,"");

  function apiBase(core){
    return normalize(
      core?.ctx?.api?.MEMPOOL ||
      core?.ctx?.api?.MEMPOOL_API ||
      W.ZZX?.api?.MEMPOOL ||
      W.ZZX?.api?.MEMPOOL_API ||
      W.ZZX?.API?.MEMPOOL ||
      W.ZZX?.API?.MEMPOOL_API ||
      "https://mempool.space/api"
    );
  }

  function fullFeedUrls(core){
    const candidates=[
      core?.ctx?.api?.MEMPOOL_FULL,
      core?.ctx?.api?.MEMPOOL_TXS,
      W.ZZX?.api?.MEMPOOL_FULL,
      W.ZZX?.api?.MEMPOOL_TXS,
      W.ZZX?.API?.MEMPOOL_FULL,
      W.ZZX?.API?.MEMPOOL_TXS,
      "/bitcoin/mempool/api/full.json"
    ].map(v=>String(v||"").trim()).filter(Boolean);

    return [...new Set(candidates)];
  }

  function get(core){
    const base=apiBase(core);

    return {
      apiBase:base,
      refreshMs:15000,
      maxVisualTiles:1400,
      endpoints:{
        mempool:join(base,"mempool"),
        blocks:join(base,"v1/fees/mempool-blocks"),
        recommended:join(base,"v1/fees/recommended"),
        tipHeight:join(base,"blocks/tip/height")
      },
      fullFeedUrls:fullFeedUrls(core),
      price:W.ZZXAPI?.url
        ? W.ZZXAPI.url("/bitcoin/bpi/api/latest.json")
        : "/bitcoin/bpi/api/latest.json"
    };
  }

  W.ZZXMempoolSpecsSources=Object.freeze({
    __version:5,
    get,
    apiBase,
    fullFeedUrls
  });
})();
