// __partials/widgets/nodes/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesFetch?.__version||0)>=5)return;

  async function json(_url,{force=false}={}){
    if(!W.ZZXBitnodes?.load){
      throw new Error("ZZXBitnodes shared data service is unavailable");
    }

    const detail=await W.ZZXBitnodes.load(Boolean(force));
    return Object.freeze({
      data:detail.snapshot,
      source:detail.source||"ZZXBitnodes",
      transport:detail.transport||"shared",
      stale:!!detail.stale,
      cachedAt:Number(detail.snapshot?.updatedMs)||Date.now()
    });
  }

  W.ZZXNodesFetch=Object.freeze({
    __version:5,
    json
  });
})();
