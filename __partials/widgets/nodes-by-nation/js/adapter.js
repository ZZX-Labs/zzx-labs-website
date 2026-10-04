// __partials/widgets/nodes-by-nation/js/adapter.js
// Compatibility facade for older callers. New widget code uses model.js directly.
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXNodesByNationAdapter?.__version||0)>=7)return;
  W.ZZXNodesByNationAdapter=Object.freeze({
    __version:7,
    fromSnapshotNodes(nodes){return W.ZZXNodesByNationModel.fromNodes({nodes});},
    normalizeRows(payload){return W.ZZXNodesByNationModel.fromAggregate(payload);},
    build(payload){return W.ZZXNodesByNationModel.build(payload);}
  });
})();
