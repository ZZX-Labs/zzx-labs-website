// v5 — exact gapless square atlas for every projected-block transaction.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLayout?.__version>=5)return;

  const Scaler=()=>W.ZZXMempoolTilesScaler;
  const Sorter=()=>W.ZZXMempoolTilesSorter;
  const Packer=()=>W.ZZXMempoolTilesPacker;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function empty(scaleMode,sortMode,seed){
    return {
      schema:"zzx-mempool-tiles-square-atlas-v5",
      tiles:[],
      byTxid:new Map(),
      root:null,
      coverage:0,
      fragmentCount:0,
      maxDepth:0,
      scale:null,
      scaleMode,
      sortMode,
      seed,
      blockFillRatio:0,
      builtAt:Date.now()
    };
  }

  function build(model,{scaleMode="value",sortMode="priority",seed=0}={}){
    const source=(model?.candidate||[]).filter(tx=>tx?.txid);
    if(!source.length)return empty(scaleMode,sortMode,seed);

    const ordered=Sorter().sort(source,sortMode,seed);
    const scale=Scaler().makeScale(ordered,scaleMode);
    const prepared=ordered.map((tx,index)=>({
      ...tx,
      __sortIndex:index,
      __atlasMetric:Scaler().metricValue(tx,scaleMode),
      __atlasNormalized:Scaler().normalized(tx,scale),
      __atlasWeight:Scaler().weight(tx,scale)
    }));

    const atlas=Packer().pack(prepared,{seed});
    const tiles=atlas.leaves.map((tile,index)=>({...tile,index}));
    const byTxid=new Map();

    for(const tile of tiles){
      const prior=byTxid.get(tile.txid);
      if(!prior||prior.__fragment)byTxid.set(tile.txid,tile);
    }

    const target=Math.max(1,Number(model?.targetVbytes)||1_000_000);
    const actual=Math.max(0,Number(model?.candidateVsize)||0);

    return {
      schema:"zzx-mempool-tiles-square-atlas-v5",
      tiles,
      byTxid,
      root:atlas.root,
      coverage:atlas.coverage,
      fragmentCount:atlas.fragmentCount,
      maxDepth:atlas.maxDepth,
      sourceCount:atlas.sourceCount,
      leafCount:atlas.leafCount,
      scale,
      scaleMode,
      sortMode,
      seed,
      blockFillRatio:clamp(actual/target,0,1.25),
      builtAt:Date.now()
    };
  }

  function hit(layout,nx,ny){
    if(!(nx>=0&&nx<=1&&ny>=0&&ny<=1))return null;
    return Packer().hit(layout?.root,nx,ny);
  }

  W.ZZXMempoolTilesLayout=Object.freeze({
    __version:5,
    build,
    hit
  });
})();
