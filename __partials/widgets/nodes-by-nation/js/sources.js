// __partials/widgets/nodes-by-nation/js/sources.js
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXNodesByNationSources?.__version||0)>=7)return;
  W.ZZXNodesByNationSources=Object.freeze({
    __version:7,
    sharedModule:"/__partials/widgets/_shared/zzx-bitnodes.js",
    refreshMs:15*60*1000,
    pageSize:10,
    cacheKey:"zzx:nodes-by-nation:v7"
  });
})();
