// __partials/widgets/node-network-mix/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeNetworkMixProvider?.__version||0)>=2)return;

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
      model:W.ZZXNodeNetworkMixModel.build(detail.snapshot)
    });
  }

  W.ZZXNodeNetworkMixProvider=Object.freeze({
    __version:2,
    load
  });
})();
