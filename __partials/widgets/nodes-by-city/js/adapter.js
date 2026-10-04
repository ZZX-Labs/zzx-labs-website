// __partials/widgets/nodes-by-city/js/adapter.js
// Compatibility facade for legacy loaders. City v7 uses model.js directly.
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCityAdapter?.__version||0)>=7)return;

  W.ZZXNodesByCityAdapter=Object.freeze({
    __version:7,
    fromSnapshotNodes(nodes){
      return W.ZZXNodesByCityModel.fromNodes({nodes});
    },
    normalizeRows(payload){
      return W.ZZXNodesByCityModel.fromAggregate(payload);
    },
    build(payload){
      return W.ZZXNodesByCityModel.build(payload);
    }
  });
})();
