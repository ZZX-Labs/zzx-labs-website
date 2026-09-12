// __partials/widgets/mempool-tiles/js/layout.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLayout?.__version>=1)return;

  const Scaler=()=>W.ZZXMempoolTilesScaler;
  const Packer=()=>W.ZZXMempoolTilesPacker;

  function build(model,{
    scaleMode="vsize",
    sortMode="priority",
    seed=0
  }={}){
    const items=(model?.candidate||[]).filter(tx=>tx?.txid);

    if(!items.length){
      return {
        tiles:[],
        byTxid:new Map(),
        gridN:1,
        spatial:new Int32Array(1),
        fillRatio:0,
        scale:null,
        sortMode,
        scaleMode,
        seed
      };
    }

    const scale=Scaler().makeScale(items,scaleMode);

    const squareItems=items.map(tx=>({
      ...tx,
      side:Scaler().side(tx,scale)
    }));

    const packed=Packer().pack(squareItems,{
      targetFill:.86,
      maxGrid:512,
      sortMode,
      seed
    });

    if(packed.placed.length!==items.length){
      throw new Error(`layout lost transactions ${packed.placed.length}/${items.length}`);
    }

    const n=packed.gridN;

    const tiles=packed.placed.map((row,index)=>({
      ...row,
      index,
      x:row.cellX/n,
      y:row.cellY/n,
      side:row.sideCells/n
    }));

    const byTxid=new Map(tiles.map(tile=>[tile.txid,tile]));
    const spatial=new Int32Array(n*n);

    for(let index=0;index<tiles.length;index++){
      const tile=tiles[index];

      for(let y=tile.cellY;y<tile.cellY+tile.sideCells;y++){
        const offset=y*n;
        for(let x=tile.cellX;x<tile.cellX+tile.sideCells;x++){
          spatial[offset+x]=index+1;
        }
      }
    }

    return {
      schema:"zzx-mempool-tiles-layout-v1",
      tiles,
      byTxid,
      gridN:n,
      spatial,
      fillRatio:packed.fillRatio,
      scale,
      sortMode,
      scaleMode,
      seed,
      attempts:packed.attempts,
      builtAt:Date.now()
    };
  }

  function hit(layout,nx,ny){
    if(!layout?.spatial||!(nx>=0&&nx<1&&ny>=0&&ny<1))return null;

    const n=layout.gridN;
    const x=Math.min(n-1,Math.max(0,Math.floor(nx*n)));
    const y=Math.min(n-1,Math.max(0,Math.floor(ny*n)));
    const index=layout.spatial[y*n+x]-1;

    return index>=0?layout.tiles[index]||null:null;
  }

  W.ZZXMempoolTilesLayout=Object.freeze({
    __version:1,
    build,
    hit
  });
})();
