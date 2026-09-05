// __partials/widgets/mempool-specs/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsSources?.__version>=3)return;

  function normalizeBase(value){
    return String(value||"").trim().replace(/\/+$/g,"");
  }

  function resolveBase(core){
    return normalizeBase(
      core?.ctx?.api?.MEMPOOL ||
      core?.ctx?.api?.MEMPOOL_API ||
      W.ZZX?.api?.MEMPOOL ||
      W.ZZX?.api?.MEMPOOL_API ||
      W.ZZX?.API?.MEMPOOL ||
      W.ZZX?.API?.MEMPOOL_API ||
      "https://mempool.space/api"
    );
  }

  function join(base,path){
    return normalizeBase(base)+"/"+String(path||"").replace(/^\/+/,"");
  }

  function get(core){
    const apiBase=resolveBase(core);
    return {
      apiBase,
      refreshMs:30000,
      recentLimit:20,
      candidateVbytes:1_000_000,
      endpoints:{
        mempool:join(apiBase,"mempool"),
        blocks:join(apiBase,"v1/fees/mempool-blocks"),
        tipHeight:join(apiBase,"blocks/tip/height"),
        recent:join(apiBase,"mempool/recent"),
        tx:join(apiBase,"tx/{txid}")
      },
      price:W.ZZXAPI?.url
        ? W.ZZXAPI.url("/bitcoin/bpi/api/latest.json")
        : "/bitcoin/bpi/api/latest.json"
    };
  }

  W.ZZXMempoolSpecsSources=Object.freeze({
    __version:3,
    get
  });
})();
