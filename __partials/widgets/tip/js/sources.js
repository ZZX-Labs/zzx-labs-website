// __partials/widgets/tip/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTipSources?.__version>=4)return;

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

  W.ZZXTipSources=Object.freeze({
    __version:4,
    bases,
    refreshMs:15000,
    timeoutMs:12000
  });
})();
