// __partials/widgets/nodes/js/history.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesHistory?.__version||0)>=5)return;

  async function load(force=false){
    if(!W.ZZXBitnodes?.history)return [];
    const rows=await W.ZZXBitnodes.history(Boolean(force));
    return Array.isArray(rows)?rows:[];
  }

  W.ZZXNodesHistory=Object.freeze({
    __version:5,
    load
  });
})();
