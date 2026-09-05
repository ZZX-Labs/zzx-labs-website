// __partials/widgets/nodes-by-city/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByCityProvider?.__version>=3)return;

  function localUrl(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function modelFromPayload(payload,source,transport){
    let rows=W.ZZXNodesByCityAdapter.normalizeRows(payload);

    if(!rows.length&&payload?.nodes){
      rows=W.ZZXNodesByCityAdapter.fromSnapshotNodes(payload.nodes);
    }

    const total=W.ZZXNodesByCityAdapter.networkTotal(payload,rows);
    rows=W.ZZXNodesByCityAdapter.finalize(rows,total);

    if(!rows.length){
      throw new Error(`${source} contained no city distribution`);
    }

    return {
      rows,
      networkTotal:total,
      geolocatedTotal:rows.reduce((sum,item)=>sum+item.nodes,0),
      updatedMs:W.ZZXNodesByCityAdapter.updated(payload),
      source,
      transport
    };
  }

  async function shared(){
    if(!W.ZZXBitnodesData)return null;

    try{
      const aggregate=await W.ZZXBitnodesData.aggregate?.();

      if(aggregate){
        const rows=W.ZZXNodesByCityAdapter.normalizeRows(
          aggregate?.top?.cities ?? aggregate
        );

        if(rows.length){
          const total=W.ZZXNodesByCityAdapter.networkTotal(aggregate,rows);

          return {
            rows:W.ZZXNodesByCityAdapter.finalize(rows,total),
            networkTotal:total,
            geolocatedTotal:rows.reduce((sum,item)=>sum+item.nodes,0),
            updatedMs:W.ZZXNodesByCityAdapter.updated(aggregate),
            source:"ZZXBitnodesData.aggregate().top.cities",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    try{
      const latest=await W.ZZXBitnodesData.latest?.();

      if(latest?.nodes){
        const rows=W.ZZXNodesByCityAdapter.fromSnapshotNodes(latest.nodes);

        if(rows.length){
          const total=W.ZZXNodesByCityAdapter.networkTotal(latest,rows);

          return {
            rows:W.ZZXNodesByCityAdapter.finalize(rows,total),
            networkTotal:total,
            geolocatedTotal:rows.reduce((sum,item)=>sum+item.nodes,0),
            updatedMs:W.ZZXNodesByCityAdapter.updated(latest),
            source:"ZZXBitnodesData.latest().nodes",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    return null;
  }

  async function localPayload(path,label){
    const res=await W.ZZXNodesByCityFetch.json(
      localUrl(path),
      {
        local:true,
        allowProxy:false
      }
    );

    return modelFromPayload(
      res.data,
      label,
      res.transport
    );
  }

  async function upstreamCities(){
    let lastError=null;

    for(const url of W.ZZXNodesByCitySources.upstreamCities){
      try{
        const res=await W.ZZXNodesByCityFetch.json(
          url,
          {
            local:false,
            allowProxy:true
          }
        );

        return modelFromPayload(
          res.data,
          url,
          res.transport
        );
      }catch(error){
        lastError=error;
      }
    }

    // Final mirrored upstream fallback: derive from the latest snapshot
    // itself if the dedicated city endpoint is unavailable.
    try{
      const res=await W.ZZXNodesByCityFetch.json(
        W.ZZXNodesByCitySources.upstreamLatest,
        {
          local:false,
          allowProxy:true
        }
      );

      return modelFromPayload(
        res.data,
        W.ZZXNodesByCitySources.upstreamLatest,
        res.transport
      );
    }catch(error){
      lastError=error;
    }

    throw lastError||new Error("btcnodes.io city data unavailable");
  }

  async function load(){
    const fromShared=await shared();
    if(fromShared)return fromShared;

    const localCandidates=[
      [W.ZZXNodesByCitySources.localAggregate,"local ZZX aggregate"],
      [W.ZZXNodesByCitySources.localLatest,"local ZZX latest snapshot"],
      [W.ZZXNodesByCitySources.localOriginalLatest,"local mirrored upstream snapshot"]
    ];

    let lastError=null;

    for(const [path,label] of localCandidates){
      try{
        return await localPayload(path,label);
      }catch(error){
        lastError=error;
      }
    }

    try{
      return await upstreamCities();
    }catch(error){
      lastError=error;
    }

    throw lastError||new Error("all nodes-by-city sources unavailable");
  }

  W.ZZXNodesByCityProvider=Object.freeze({
    __version:3,
    load
  });
})();
