// __partials/widgets/nodes/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesSources?.__version>=3)return;

  W.ZZXNodesSources=Object.freeze({
    __version:3,

    localAggregate:"/bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json",
    localLatest:"/bitcoin/bitnodes/api/zzxbitnodes/latest.json",
    localOriginalLatest:"/bitcoin/bitnodes/api/originalbitnodes/latest.json",

    // Public upstream replacement for the defunct service.
    upstreamLatest:"https://btcnodes.io/api/v1/snapshots/latest/",

    refreshMs:15*60*1000,
    localCacheTtlMs:5*60*1000,
    upstreamCacheTtlMs:30*60*1000,
    staleMaxMs:24*60*60*1000,
    timeoutMs:12000,

    historyKey:"zzx:nodes:history:v3",
    historyMax:96
  });
})();
