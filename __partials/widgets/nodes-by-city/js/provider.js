// __partials/widgets/nodes-by-city/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCityProvider?.__version||0)>=7)return;

  async function load(force=false){
    if(!W.ZZXBitnodes?.load){
      throw new Error("ZZXBitnodes shared data service is unavailable");
    }

    const result=await W.ZZXBitnodes.load(Boolean(force));

    if(!result?.snapshot){
      throw new Error("ZZXBitnodes returned no snapshot");
    }

    return {
      result,
      model:W.ZZXNodesByCityModel.build(result.snapshot)
    };
  }

  W.ZZXNodesByCityProvider=Object.freeze({
    __version:7,
    load
  });
})();
