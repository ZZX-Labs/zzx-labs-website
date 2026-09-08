(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolGogglesSources?.__version>=2)return;

  function bases(core){
    if(W.ZZXMempoolLive?.apiBases)return W.ZZXMempoolLive.apiBases(core);
    return ["/bitcoin/mempool/api","https://mempool.space/api"];
  }

  W.ZZXMempoolGogglesSources=Object.freeze({
    __version:2,
    bases,
    refreshMs:10000,
    candidateVbytes:1_000_000,
    maxTiles:6000,
    animationMs:420,
    trackedBlockIndex:0,
    price:"/bitcoin/bpi/api/latest.json"
  });
})();
