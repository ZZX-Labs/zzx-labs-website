// __partials/widgets/nodes-by-version/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByVersionSources?.__version>=3)return;

  W.ZZXNodesByVersionSources=Object.freeze({
    __version:3,

    localAggregate:"/bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json",
    localLatest:"/bitcoin/bitnodes/api/zzxbitnodes/latest.json",
    localOriginalLatest:"/bitcoin/bitnodes/api/originalbitnodes/latest.json",

    upstreamBase:"https://btcnodes.io/api/v1",
    upstreamUserAgents:"https://btcnodes.io/api/v1/nodes/user_agents/",
    upstreamVersions:"https://btcnodes.io/api/v1/nodes/versions/",
    upstreamLatest:"https://btcnodes.io/api/v1/snapshots/latest/",

    refreshMs:10*60*1000,
    timeoutMs:25000,
    pageSize:5
  });
})();
