// __partials/widgets/nodes-by-version/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByVersionProvider?.__version>=3)return;

  function localUrl(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function modelFromPayload(payload,source,transport){
    const rowsRaw=W.ZZXNodesByVersionAdapter.normalizeRows(payload);
    const networkTotal=W.ZZXNodesByVersionAdapter.total(payload,rowsRaw);
    const rows=W.ZZXNodesByVersionAdapter.finalize(rowsRaw,networkTotal);

    if(!rows.length){
      throw new Error(`${source} contained no user-agent distribution`);
    }

    return {
      rows,
      networkTotal,
      identifiedTotal:rows.reduce((sum,item)=>sum+item.count,0),
      latestHeight:W.ZZXNodesByVersionAdapter.height(payload),
      updatedMs:W.ZZXNodesByVersionAdapter.updated(payload),
      source,
      transport
    };
  }

  async function shared(){
    if(!W.ZZXBitnodesData)return null;

    try{
      const aggregate=await W.ZZXBitnodesData.aggregate?.();

      if(aggregate){
        let rows=[];

        if(W.ZZXBitnodesData.deriveAgentRows){
          try{
            rows=W.ZZXBitnodesData.deriveAgentRows(aggregate)||[];
          }catch(_){}
        }

        if(!rows.length){
          rows=W.ZZXNodesByVersionAdapter.normalizeRows(
            aggregate?.top?.agents ?? aggregate
          );
        }

        if(rows.length){
          const total=W.ZZXNodesByVersionAdapter.total(aggregate,rows);

          return {
            rows:W.ZZXNodesByVersionAdapter.finalize(rows,total),
            networkTotal:total,
            identifiedTotal:rows.reduce((sum,item)=>sum+Number(item.count||item.nodes||0),0),
            latestHeight:W.ZZXNodesByVersionAdapter.height(aggregate),
            updatedMs:W.ZZXNodesByVersionAdapter.updated(aggregate),
            source:"ZZXBitnodesData.aggregate()",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    try{
      const latest=await W.ZZXBitnodesData.latest?.();

      if(latest){
        const rows=W.ZZXNodesByVersionAdapter.normalizeRows(latest);

        if(rows.length){
          const total=W.ZZXNodesByVersionAdapter.total(latest,rows);

          return {
            rows:W.ZZXNodesByVersionAdapter.finalize(rows,total),
            networkTotal:total,
            identifiedTotal:rows.reduce((sum,item)=>sum+item.count,0),
            latestHeight:W.ZZXNodesByVersionAdapter.height(latest),
            updatedMs:W.ZZXNodesByVersionAdapter.updated(latest),
            source:"ZZXBitnodesData.latest()",
            transport:"shared-local"
          };
        }
      }
    }catch(_){}

    return null;
  }

  async function localPayload(path,label){
    const res=await W.ZZXNodesByVersionFetch.json(
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

  async function upstream(){
    const endpoints=[
      W.ZZXNodesByVersionSources.upstreamUserAgents,
      W.ZZXNodesByVersionSources.upstreamVersions,
      W.ZZXNodesByVersionSources.upstreamLatest
    ];

    let lastError=null;
    let latest=null;

    for(const endpoint of endpoints){
      try{
        const res=await W.ZZXNodesByVersionFetch.json(
          endpoint,
          {
            local:false,
            allowProxy:true
          }
        );

        if(endpoint===W.ZZXNodesByVersionSources.upstreamLatest){
          latest=res;
        }

        try{
          return modelFromPayload(
            res.data,
            endpoint,
            res.transport
          );
        }catch(error){
          lastError=error;
        }
      }catch(error){
        lastError=error;
      }
    }

    if(latest){
      const ts=W.ZZXNodesByVersionAdapter.latestTimestamp(
        latest.data
      );

      if(Number.isFinite(ts)){
        const snapshotUrl=
          `${W.ZZXNodesByVersionSources.upstreamBase}/snapshots/${ts}/`;

        try{
          const res=await W.ZZXNodesByVersionFetch.json(
            snapshotUrl,
            {
              local:false,
              allowProxy:true
            }
          );

          return modelFromPayload(
            res.data,
            snapshotUrl,
            res.transport
          );
        }catch(error){
          lastError=error;
        }
      }
    }

    throw lastError||new Error("btcnodes.io version data unavailable");
  }

  async function load(){
    const fromShared=await shared();
    if(fromShared)return fromShared;

    const locals=[
      [W.ZZXNodesByVersionSources.localAggregate,"local ZZX aggregate"],
      [W.ZZXNodesByVersionSources.localLatest,"local ZZX latest snapshot"],
      [W.ZZXNodesByVersionSources.localOriginalLatest,"local mirrored upstream snapshot"]
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
      return await upstream();
    }catch(error){
      lastError=error;
    }

    throw lastError||new Error("all nodes-by-version sources unavailable");
  }

  W.ZZXNodesByVersionProvider=Object.freeze({
    __version:3,
    load
  });
})();
