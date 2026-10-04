// __partials/widgets/hashrate/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateSources?.__version>=2)return;

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

  W.ZZXHashrateSources=Object.freeze({
    __version:2,
    bases,
    refreshMs:60000,
    defaultJPerTH:30
  });
})();
