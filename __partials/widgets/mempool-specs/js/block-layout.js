// __partials/widgets/mempool-specs/js/block-layout.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(W.ZZXMempoolSpecsBlockLayout?.__version>=5)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function dynamicMaxSide(count){
    const n=Math.max(1,Math.floor(Number(count)||1));
    if(n>=6000)return 6;
    if(n>=4000)return 7;
    if(n>=2500)return 8;
    if(n>=1400)return 9;
    if(n>=700)return 10;
    return 12;
  }

  function build(blockView){
    const sourceItems=(blockView?.items||[])
      .filter(item=>item?.realTx!==false&&item?.txid);

    if(!sourceItems.length){
      return {
        schema:"zzx-mempool-specs-square-layout-v5",
        tiles:[],
        byId:new Map(),
        byTxid:new Map(),
        gridN:1,
        spatial:new Int32Array(1),
        occupiedCells:0,
        visualCoverage:0,
        everyTxVisible:true,
        totalValueSats:finite(blockView?.totalValueSats),
        valueKnownCount:0,
        valueCoverage:0,
        vsizeCoverage:clamp(finite(blockView?.coverage)||0,0,1),
        valueScale:null,
        builtAt:Date.now()
      };
    }

    const Scaler=NS.Scaler;
    if(typeof Scaler!=="function"){
      throw new Error("Mempool Specs Scaler v6 is unavailable");
    }

    if(!NS.TetriFill?.packAdaptive){
      throw new Error("Mempool Specs TetriFill v6 is unavailable");
    }

    const scaler=new Scaler();
    const maxSide=dynamicMaxSide(sourceItems.length);
    const scale=scaler.makeBtcValueScale(
      sourceItems,
      {
        minSide:1,
        maxSide,
        lowQuantile:.02,
        highQuantile:.995,
        curve:.74
      }
    );

    const squareItems=sourceItems.map((item,index)=>{
      const value=finite(item.valueSats);
      const valueKnown=Number.isFinite(value)&&value>=0;
      const side=scaler.sideCellsFromValueSats(value,scale);

      return {
        ...item,
        valueKnown,
        squareSideCells:side,
        side,
        projectedRank:Number.isFinite(finite(item.projectedRank))
          ? finite(item.projectedRank)
          : index
      };
    });

    const packed=NS.TetriFill.packAdaptive(
      squareItems,
      {
        targetFill:.86,
        maxGrid:512,
        seed:Number(blockView?.nextHeight)||0
      }
    );

    if(packed.placed.length!==sourceItems.length){
      throw new Error(
        `square layout lost transactions: ${packed.placed.length}/${sourceItems.length}`
      );
    }

    const n=packed.gridN;

    const tiles=packed.placed.map((tile,index)=>({
      ...tile,
      index,
      x:tile.x/n,
      y:tile.y/n,
      side:tile.side/n,
      cellX:tile.x,
      cellY:tile.y,
      sideCells:tile.side,
      rawValueShare:
        Number.isFinite(tile.valueSats)&&
        Number.isFinite(blockView?.totalValueSats)&&
        blockView.totalValueSats>0
          ? tile.valueSats/blockView.totalValueSats
          : NaN
    }));

    const byId=new Map(tiles.map(tile=>[tile.id,tile]));
    const byTxid=new Map(tiles.map(tile=>[tile.txid,tile]));

    /*
     * Hit testing uses the exact logical square grid. One occupied grid cell
     * always belongs to one real transaction tile, including 1x1 "tiny ass"
     * transactions that would be hard to recover reliably from floating point
     * rectangle scans.
     */
    const spatial=new Int32Array(n*n);

    for(let index=0;index<tiles.length;index++){
      const tile=tiles[index];

      for(let yy=tile.cellY;yy<tile.cellY+tile.sideCells;yy++){
        const offset=yy*n;
        for(let xx=tile.cellX;xx<tile.cellX+tile.sideCells;xx++){
          spatial[offset+xx]=index+1;
        }
      }
    }

    const valueKnownCount=tiles.filter(tile=>tile.valueKnown).length;

    return {
      schema:"zzx-mempool-specs-square-layout-v5",
      tiles,
      byId,
      byTxid,
      gridN:n,
      spatial,
      occupiedCells:packed.occupiedCells,
      visualCoverage:packed.fillRatio,
      everyTxVisible:tiles.length===sourceItems.length,
      totalValueSats:finite(blockView?.totalValueSats),
      valueKnownCount,
      valueCoverage:tiles.length?valueKnownCount/tiles.length:0,
      vsizeCoverage:clamp(finite(blockView?.coverage)||0,0,1),
      valueScale:{
        mode:"btc-output-value-square-log",
        minSideCells:scale.minSide,
        maxSideCells:scale.maxSide,
        lowSats:scale.low,
        highSats:scale.high,
        curve:scale.curve
      },
      packAttempts:packed.attempts,
      builtAt:Date.now()
    };
  }

  function find(layout,nx,ny){
    if(!layout?.spatial||!(nx>=0&&nx<1&&ny>=0&&ny<1))return null;

    const n=layout.gridN;
    const x=clamp(Math.floor(nx*n),0,n-1);
    const y=clamp(Math.floor(ny*n),0,n-1);
    const index=layout.spatial[y*n+x]-1;

    return index>=0
      ? layout.tiles[index]||null
      : null;
  }

  W.ZZXMempoolSpecsBlockLayout=Object.freeze({
    __version:5,
    dynamicMaxSide,
    build,
    find
  });
})();
