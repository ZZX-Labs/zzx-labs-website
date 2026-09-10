// __partials/widgets/nodes-by-county/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCountyProvider?.__version||0)>=4)return;

  async function load(force=false){
    if(!W.ZZXBitnodes?.load){
      throw new Error("ZZXBitnodes shared data service is unavailable");
    }

    const detail=await W.ZZXBitnodes.load(Boolean(force));

    if(!detail?.snapshot){
      throw new Error("ZZXBitnodes returned no normalized snapshot");
    }

    return Object.freeze({
      detail,
      model:W.ZZXNodesByCountyModel.build(detail.snapshot)
    });
  }

  W.ZZXNodesByCountyProvider=Object.freeze({
    __version:4,
    load
  });
})();
