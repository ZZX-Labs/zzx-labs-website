// __partials/widgets/mempool-specs/js/tetrifill.js
// v6 — adaptive square-only next-block packer
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TetriFill?.__version>=6)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hash32(str,seed=0){
    const s=String(str??"");
    let h=(seed>>>0)^0x9e3779b9;
    for(let i=0;i<s.length;i++){
      h=Math.imul(h^s.charCodeAt(i),0x01000193);
      h^=h>>>13;
    }
    return h>>>0;
  }

  function rankOf(row){
    for(const value of [
      row?.projectedRank,
      row?.rank,
      row?.blockRank
    ]){
      const n=Number(value);
      if(Number.isFinite(n))return n;
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function feeOf(row){
    const n=Number(row?.packageFeeRate??row?.feeRate);
    return Number.isFinite(n)?n:-Infinity;
  }

  /*
   * Large squares are placed first to prevent fragmentation. Within a square
   * size tier, projected next-block rank wins, then effective/package feerate.
   * This keeps the packed field stable and still biases higher-likelihood TXs
   * toward earlier/top-left placements.
   */
  function packingOrder(items,seed=0){
    return (Array.isArray(items)?items:[]).slice().sort((a,b)=>{
      const as=Math.max(1,Math.floor(Number(a?.side)||1));
      const bs=Math.max(1,Math.floor(Number(b?.side)||1));
      if(bs!==as)return bs-as;

      const ar=rankOf(a),br=rankOf(b);
      if(ar!==br)return ar-br;

      const af=feeOf(a),bf=feeOf(b);
      if(af!==bf)return bf-af;

      return hash32(a?.txid??a?.id,seed)-hash32(b?.txid??b?.id,seed);
    });
  }

  /*
   * Skyline packing is fast enough to rebuild the live candidate set several
   * times per second. Each placed item is an integer side×side square. There is
   * no rectangle path in this packer.
   */
  function packAtN(items,n,{seed=0}={}){
    const gridN=Math.max(1,Math.floor(n||1));
    const sky=new Uint32Array(gridN);
    const placed=[];
    const rejected=[];
    const ordered=packingOrder(items,seed);

    for(const item of ordered){
      const side=clamp(
        Math.max(1,Math.floor(Number(item?.side)||1)),
        1,
        gridN
      );

      let bestX=-1;
      let bestY=Infinity;
      let bestWaste=Infinity;

      for(let x=0;x<=gridN-side;x++){
        let y=0;
        let sum=0;

        for(let i=0;i<side;i++){
          const h=sky[x+i];
          if(h>y)y=h;
          sum+=h;
        }

        if(y+side>gridN)continue;

        const waste=side*y-sum;

        if(
          y<bestY ||
          (y===bestY&&waste<bestWaste) ||
          (y===bestY&&waste===bestWaste&&x<bestX)
        ){
          bestX=x;
          bestY=y;
          bestWaste=waste;
        }
      }

      if(bestX<0){
        rejected.push({...item,side});
        continue;
      }

      const top=bestY+side;
      for(let i=0;i<side;i++)sky[bestX+i]=top;

      placed.push({
        ...item,
        x:bestX,
        y:bestY,
        side
      });
    }

    const occupied=placed.reduce(
      (sum,row)=>sum+row.side*row.side,
      0
    );

    const maxHeight=sky.length
      ? Math.max(...sky)
      : 0;

    return {
      placed,
      rejected,
      gridN,
      occupiedCells:occupied,
      fillRatio:occupied/(gridN*gridN),
      maxHeight
    };
  }

  function packAdaptive(items,opts={}){
    const rows=(Array.isArray(items)?items:[])
      .map(row=>({
        ...row,
        side:Math.max(1,Math.floor(Number(row?.side)||1))
      }));

    if(!rows.length){
      return {
        placed:[],
        rejected:[],
        gridN:1,
        occupiedCells:0,
        fillRatio:0,
        maxHeight:0,
        attempts:0
      };
    }

    const targetFill=clamp(Number(opts.targetFill)||.86,.45,.96);
    const maxGrid=Math.max(64,Math.floor(Number(opts.maxGrid)||512));
    const seed=Number.isFinite(Number(opts.seed))?Number(opts.seed):0;

    const totalArea=rows.reduce(
      (sum,row)=>sum+row.side*row.side,
      0
    );

    const maxSide=Math.max(...rows.map(row=>row.side));
    let n=Math.max(
      maxSide,
      Math.ceil(Math.sqrt(totalArea/targetFill)),
      Math.ceil(Math.sqrt(rows.length/targetFill))
    );

    let result=null;
    let attempts=0;

    while(n<=maxGrid&&attempts<96){
      attempts++;
      result=packAtN(rows,n,{seed});

      if(!result.rejected.length){
        return {
          ...result,
          attempts
        };
      }

      // Small growth steps preserve useful canvas density instead of jumping to
      // an unnecessarily huge logical grid after one fragmented attempt.
      n=Math.min(
        maxGrid+1,
        Math.max(n+1,Math.ceil(n*1.035))
      );
    }

    /*
     * Deterministic last resort: grow beyond maxGrid only as much as necessary
     * to honor the hard contract that every candidate transaction gets a square.
     */
    n=Math.max(
      n,
      Math.ceil(Math.sqrt(totalArea))*2,
      maxSide*2
    );

    for(let i=0;i<64;i++){
      attempts++;
      result=packAtN(rows,n,{seed});
      if(!result.rejected.length){
        return {
          ...result,
          attempts
        };
      }
      n=Math.ceil(n*1.06)+1;
    }

    throw new Error(
      `square pack failed: ${result?.rejected?.length||rows.length} transactions unplaced`
    );
  }

  NS.TetriFill=Object.freeze({
    __version:6,
    hash32,
    packingOrder,
    packAtN,
    packAdaptive
  });
})();
