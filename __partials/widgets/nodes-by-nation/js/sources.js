// __partials/widgets/nodes-by-nation/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByNationSources?.__version>=3)return;

  W.ZZXNodesByNationSources=Object.freeze({
    __version:3,

    localAggregate:"/bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json",
    localLatest:"/bitcoin/bitnodes/api/zzxbitnodes/latest.json",
    localOriginalLatest:"/bitcoin/bitnodes/api/originalbitnodes/latest.json",

    upstreamBase:"https://btcnodes.io/api/v1",
    upstreamLatest:"https://btcnodes.io/api/v1/snapshots/latest/",
    upstreamCountries:[
      "https://btcnodes.io/api/v1/snapshots/latest/countries/",
      "https://btcnodes.io/api/v1/snapshots/latest/countries"
    ],

    refreshMs:15*60*1000,
    timeoutMs:12000,
    pageSize:5,
    cacheKey:"zzx:nodes-by-nation:v3"
  });
})();
