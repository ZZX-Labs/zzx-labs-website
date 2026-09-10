// __partials/widgets/nodes/js/adapter.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesAdapter?.__version||0)>=5)return;

  function normalize(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("ZZXNodesAdapter requires a normalized ZZXBitnodes snapshot");
    }

    const model=W.ZZXNodesModel?.build
      ? W.ZZXNodesModel.build(snapshot)
      : null;

    if(!model){
      throw new Error("ZZXNodesModel is unavailable");
    }

    return Object.freeze({
      kind:"ZZXBitnodes normalized snapshot",
      totalNodes:model.total,
      reachableNodes:model.total,
      latestHeight:model.latestHeight,
      updatedMs:Number(snapshot.updatedMs)||NaN,
      ipv4:model.networkCounts.ipv4,
      ipv6:model.networkCounts.ipv6,
      tor:model.networkCounts.tor,
      i2p:model.networkCounts.i2p,
      cjdns:model.networkCounts.cjdns,
      other:model.networkCounts.other,
      hasNodeMap:Array.isArray(snapshot.nodes)&&snapshot.nodes.length>0
    });
  }

  W.ZZXNodesAdapter=Object.freeze({
    __version:5,
    normalize
  });
})();
