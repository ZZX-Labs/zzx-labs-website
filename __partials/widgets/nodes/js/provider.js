// __partials/widgets/nodes/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesProvider?.__version||0)>=5)return;

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
      model:W.ZZXNodesModel.build(detail.snapshot)
    });
  }

  async function history(force=false){
    if(!W.ZZXBitnodes?.history)return [];
    const rows=await W.ZZXBitnodes.history(Boolean(force));
    return Array.isArray(rows)?rows:[];
  }

  W.ZZXNodesProvider=Object.freeze({
    __version:5,
    load,
    history
  });
})();
