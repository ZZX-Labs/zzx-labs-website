(function(){
  "use strict";
  const W=window;
  if(W.ZZXIChingConstants?.__version>=3)return;
  W.ZZXIChingConstants=Object.freeze({
    __version:3,
    storageKey:"zzx.widgets.iching.lots.v3",
    legacyStorageKeys:["zzx.widgets.iching.lots.v2"],
    priceCacheKey:"zzx.widgets.iching.historical-price-cache.v1",
    maxLots:500,
    earliestDate:"2010-07-18",
    refreshMs:30000,
    projectPath:"/projects/software/iching/",
    sharedChainPath:"/__partials/widgets/_shared/zzx-chain.js",
    sharedFxPath:"/__partials/widgets/_shared/zzx-fx.js"
  });
})();
