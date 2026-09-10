// __partials/widgets/nodes/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesSources?.__version||0)>=5)return;

  W.ZZXNodesSources=Object.freeze({
    __version:5,
    sharedService:"ZZXBitnodes",
    sharedModule:"/__partials/widgets/_shared/zzx-bitnodes.js",
    directUpstream:false,
    proxyFallback:false
  });
})();
