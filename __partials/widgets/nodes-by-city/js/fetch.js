// __partials/widgets/nodes-by-city/js/fetch.js
// Compatibility facade. Nodes-by-City consumes the shared canonical ZZXBitnodes snapshot.
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCityFetch?.__version||0)>=7)return;

  async function shared(force=false){
    if(!W.ZZXBitnodes?.load){
      throw new Error("ZZXBitnodes shared data service is unavailable");
    }
    return W.ZZXBitnodes.load(Boolean(force));
  }

  W.ZZXNodesByCityFetch=Object.freeze({
    __version:7,
    shared
  });
})();
