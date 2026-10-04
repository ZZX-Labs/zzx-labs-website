// __partials/widgets/mempool-tiles/js/layout.js
// v3 — stable one-slot-per-transaction square tile grid
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLayout?.__version>=3)return;

  const Scaler=()=>W.ZZXMempoolTilesScaler;
  const Sorter=()=>W.ZZXMempoolTilesSorter;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function build(model,{
    scaleMode="vsize",
    sortMode="priority",
    seed=0
  }={}){
    const source=(model?.candidate||[])
      .filter(tx=>tx?.txid);

    if(!source.length){
      return {
        schema:"zzx-mempool-tiles-grid-v3",
        tiles:[],
        byTxid:new Map(),
        gridN:1,
        spatial:new Int32Array(1),
        slotFillRatio:0,
        blockFillRatio:0,
        scale:null,
        scaleMode,
        sortMode,
        seed,
        builtAt:Date.now()
      };
    }

    const ordered=Sorter().sort(
      source,
      sortMode,
      seed
    );

    const gridN=Math.max(
      1,
      Math.ceil(
        Math.sqrt(ordered.length)
      )
    );

    const cell=1/gridN;
    const scale=Scaler().makeScale(
      ordered,
      scaleMode
    );

    const tiles=ordered.map((tx,index)=>{
      const cellX=index%gridN;
      const cellY=Math.floor(index/gridN);
      const footprint=Scaler().ratio(tx,scale);
      const side=cell*footprint;
      const cx=(cellX+.5)*cell;
      const cy=(cellY+.5)*cell;

      return {
        ...tx,
        index,
        cellX,
        cellY,
        cellSide:cell,
        footprint,
        cx,
        cy,
        side,
        x:cx-side/2,
        y:cy-side/2
      };
    });

    const byTxid=new Map(
      tiles.map(tile=>[tile.txid,tile])
    );

    /*
     * Hit testing uses the entire logical slot, not only the visible square.
     * Tiny transactions therefore remain just as selectable as large ones.
     */
    const spatial=new Int32Array(gridN*gridN);

    for(let index=0;index<tiles.length;index++){
      const tile=tiles[index];
      spatial[tile.cellY*gridN+tile.cellX]=index+1;
    }

    const target=Math.max(
      1,
      Number(model?.targetVbytes)||1_000_000
    );

    const actual=Math.max(
      0,
      Number(model?.candidateVsize)||0
    );

    return {
      schema:"zzx-mempool-tiles-grid-v3",
      tiles,
      byTxid,
      gridN,
      spatial,
      slotFillRatio:
        tiles.length/(gridN*gridN),
      blockFillRatio:
        clamp(actual/target,0,1.25),
      scale,
      scaleMode,
      sortMode,
      seed,
      builtAt:Date.now()
    };
  }

  function hit(layout,nx,ny){
    if(
      !layout?.spatial ||
      !(nx>=0&&nx<1&&ny>=0&&ny<1)
    ){
      return null;
    }

    const n=layout.gridN;
    const x=clamp(Math.floor(nx*n),0,n-1);
    const y=clamp(Math.floor(ny*n),0,n-1);
    const index=layout.spatial[y*n+x]-1;

    return index>=0
      ? layout.tiles[index]||null
      : null;
  }

  W.ZZXMempoolTilesLayout=Object.freeze({
    __version:3,
    build,
    hit
  });
})();
