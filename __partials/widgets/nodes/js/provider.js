// __partials/widgets/nodes/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesProvider?.__version>=3)return;

  function localUrl(path){
    return W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;
  }

  async function fromShared(){
    if(!W.ZZXBitnodesData)return null;

    try{
      const aggregate=await W.ZZXBitnodesData.aggregate?.();

      if(aggregate){
        const model=W.ZZXNodesAdapter.normalize(
          aggregate,
          "ZZXBitnodesData.aggregate"
        );

        if(model.totalNodes>0||model.reachableNodes>0){
          return {
            model,
            source:"ZZXBitnodesData.aggregate()",
            transport:"shared-local",
            stale:false
          };
        }
      }
    }catch(_){}

    try{
      const latest=await W.ZZXBitnodesData.latest?.();

      if(latest){
        const model=W.ZZXNodesAdapter.normalize(
          latest,
          "ZZXBitnodesData.latest"
        );

        if(model.totalNodes>0||model.reachableNodes>0){
          return {
            model,
            source:"ZZXBitnodesData.latest()",
            transport:"shared-local",
            stale:false
          };
        }
      }
    }catch(_){}

    return null;
  }

  async function fetchCandidate(url,kind,ttlMs,local){
    const res=await W.ZZXNodesFetch.json(
      local?localUrl(url):url,
      {
        local,
        ttlMs,
        allowProxy:!local
      }
    );

    const model=W.ZZXNodesAdapter.normalize(
      res.data,
      kind
    );

    if(!(model.totalNodes>0||model.reachableNodes>0)){
      throw new Error(`${kind} contained no usable node total`);
    }

    return {
      model,
      source:local?url:W.ZZXNodesSources.upstreamLatest,
      transport:res.source,
      stale:!!res.stale,
      cachedAt:res.cachedAt
    };
  }

  async function load(){
    const shared=await fromShared();
    if(shared)return shared;

    const candidates=[
      {
        url:W.ZZXNodesSources.localAggregate,
        kind:"local aggregate",
        ttl:W.ZZXNodesSources.localCacheTtlMs,
        local:true
      },
      {
        url:W.ZZXNodesSources.localLatest,
        kind:"local latest snapshot",
        ttl:W.ZZXNodesSources.localCacheTtlMs,
        local:true
      },
      {
        url:W.ZZXNodesSources.localOriginalLatest,
        kind:"local mirrored upstream snapshot",
        ttl:W.ZZXNodesSources.localCacheTtlMs,
        local:true
      },
      {
        url:W.ZZXNodesSources.upstreamLatest,
        kind:"btcnodes.io latest snapshot",
        ttl:W.ZZXNodesSources.upstreamCacheTtlMs,
        local:false
      }
    ];

    let lastError=null;

    for(const candidate of candidates){
      try{
        return await fetchCandidate(
          candidate.url,
          candidate.kind,
          candidate.ttl,
          candidate.local
        );
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("all node data sources unavailable");
  }

  W.ZZXNodesProvider=Object.freeze({
    __version:3,
    load
  });
})();
