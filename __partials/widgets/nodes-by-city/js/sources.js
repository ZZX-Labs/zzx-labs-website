// __partials/widgets/nodes-by-city/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCitySources?.__version||0)>=7)return;

  W.ZZXNodesByCitySources=Object.freeze({
    __version:7,
    sharedModule:"/__partials/widgets/_shared/zzx-bitnodes.js",
    refreshMs:15*60*1000,
    pageSize:10,
    cacheKey:"zzx:nodes-by-city:v7"
  });
})();
