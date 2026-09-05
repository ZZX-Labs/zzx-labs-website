// __partials/widgets/nodes-by-nation/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByNationProvider?.__version>=3)return;

  function localUrl(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function modelFromPayload(payload,source,transport){
    let rows=W.ZZXNodesByNationAdapter.normalizeRows(payload);

    if(!rows.length&&payload?.nodes){
      rows=W.ZZXNodesByNationAdapter.fromSnapshotNodes(payload.nodes);
    }

    const total=W.ZZXNodesByNationAdapter.networkTotal(payload,rows);
    rows=W.ZZXNodesByNationAdapter.finalize(rows,total);

    if(!rows.length){
      throw new Error(`${source} contained no nation distribution`);
    }

    return {
      rows,
      networkTotal:total,
      geolocatedTotal:rows.reduce((sum,item)=>sum+item.nodes,0),
      updatedMs:W.ZZXNodesByNationAdapter.updated(payload),
      source,
      transport
    };
  }

  async function shared(){
    if(!W.ZZXBitnodesData)return null;

    try{
      const aggregate=await W.ZZXBitnodesData.aggregate?.();

      if(aggregate){
        const direct=W.ZZXNodesByNationAdapter.normalizeRows(
          aggregate?.top?.countries ?? aggregate
        );

        if(direct.length){
          const total=W.ZZXNodesByNationAdapter.networkTotal(
            aggregate,
            direct
          );

          return {
            rows:W.ZZXNodesByNationAdapter.finalize(direct,total),
            networkTotal:total,
            geolocatedTotal:direct.reduce((sum,item)=>sum+item.nodes,0),
            updatedMs:W.ZZXNodesByNationAdapter.updated(aggregate),
            source:"ZZXBitnodesData.aggregate().top.countries",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    try{
      const latest=await W.ZZXBitnodesData.latest?.();

      if(latest?.nodes){
        const rows=W.ZZXNodesByNationAdapter.fromSnapshotNodes(
          latest.nodes
        );

        if(rows.length){
          const total=W.ZZXNodesByNationAdapter.networkTotal(
            latest,
            rows
          );

          return {
            rows:W.ZZXNodesByNationAdapter.finalize(rows,total),
            networkTotal:total,
            geolocatedTotal:rows.reduce((sum,item)=>sum+item.nodes,0),
            updatedMs:W.ZZXNodesByNationAdapter.updated(latest),
            source:"ZZXBitnodesData.latest().nodes",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    return null;
  }

  async function localPayload(path,label){
    const res=await W.ZZXNodesByNationFetch.json(
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

  async function upstreamLatest(){
    const res=await W.ZZXNodesByNationFetch.json(
      W.ZZXNodesByNationSources.upstreamLatest,
      {
        local:false,
        allowProxy:true
      }
    );

    return res;
  }

  async function upstreamCountries(){
    let lastError=null;

    for(const url of W.ZZXNodesByNationSources.upstreamCountries){
      try{
        const res=await W.ZZXNodesByNationFetch.json(
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

    let latest=null;

    try{
      latest=await upstreamLatest();
      const timestamp=W.ZZXNodesByNationAdapter.latestTimestamp(
        latest.data
      );

      if(Number.isFinite(timestamp)){
        const dynamic=[
          `${W.ZZXNodesByNationSources.upstreamBase}/snapshots/${timestamp}/countries/`,
          `${W.ZZXNodesByNationSources.upstreamBase}/snapshots/${timestamp}/countries`
        ];

        for(const url of dynamic){
          try{
            const res=await W.ZZXNodesByNationFetch.json(
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
      }
    }catch(error){
      lastError=error;
    }

    if(latest){
      try{
        return modelFromPayload(
          latest.data,
          W.ZZXNodesByNationSources.upstreamLatest,
          latest.transport
        );
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("btcnodes.io nation data unavailable");
  }

  async function load(){
    const fromShared=await shared();
    if(fromShared)return fromShared;

    const locals=[
      [W.ZZXNodesByNationSources.localAggregate,"local ZZX aggregate"],
      [W.ZZXNodesByNationSources.localLatest,"local ZZX latest snapshot"],
      [W.ZZXNodesByNationSources.localOriginalLatest,"local mirrored upstream snapshot"]
    ];

    let lastError=null;

    for(const [path,label] of locals){
      try{
        return await localPayload(path,label);
      }catch(error){
        lastError=error;
      }
    }

    try{
      return await upstreamCountries();
    }catch(error){
      lastError=error;
    }

    throw lastError||new Error("all nodes-by-nation sources unavailable");
  }

  W.ZZXNodesByNationProvider=Object.freeze({
    __version:3,
    load
  });
})();
