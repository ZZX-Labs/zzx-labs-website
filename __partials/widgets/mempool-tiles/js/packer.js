// __partials/widgets/mempool-tiles/js/packer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesPacker?.__version>=1)return;

  const S=()=>W.ZZXMempoolTilesSorter;

  function packAtN(items,n,{sortMode="priority",seed=0}={}){
    const gridN=Math.max(1,Math.floor(n||1));
    const sky=new Uint32Array(gridN);
    const placed=[];
    const rejected=[];

    /*
     * Square size is the dominant packing constraint. Within equal-size tiers,
     * the requested arrangement controls visual order. This prevents holes from
     * causing transactions to disappear while retaining recognizable sorting.
     */
    const ordered=S().sort(items,sortMode,seed).sort((a,b)=>{
      const as=Math.max(1,Math.floor(Number(a.side)||1));
      const bs=Math.max(1,Math.floor(Number(b.side)||1));
      if(bs!==as)return bs-as;

      const ar=Number(a.__sortIndex);
      const br=Number(b.__sortIndex);
      return ar-br;
    });

    for(const item of ordered){
      const side=Math.max(1,Math.min(gridN,Math.floor(Number(item.side)||1)));
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
        rejected.push(item);
        continue;
      }

      const top=bestY+side;
      for(let i=0;i<side;i++)sky[bestX+i]=top;

      placed.push({
        ...item,
        cellX:bestX,
        cellY:bestY,
        sideCells:side
      });
    }

    const occupied=placed.reduce(
      (sum,row)=>sum+row.sideCells*row.sideCells,
      0
    );

    return {
      placed,
      rejected,
      gridN,
      occupiedCells:occupied,
      fillRatio:occupied/(gridN*gridN)
    };
  }

  function pack(items,{targetFill=.86,maxGrid=512,sortMode="priority",seed=0}={}){
    const sorted=S().sort(items,sortMode,seed);
    const withIndex=sorted.map((row,index)=>({...row,__sortIndex:index}));

    if(!withIndex.length){
      return {
        placed:[],
        rejected:[],
        gridN:1,
        occupiedCells:0,
        fillRatio:0,
        attempts:0
      };
    }

    const totalArea=withIndex.reduce(
      (sum,row)=>sum+Math.max(1,Number(row.side)||1)**2,
      0
    );

    const maxSide=Math.max(...withIndex.map(row=>Math.max(1,Number(row.side)||1)));
    let n=Math.max(
      maxSide,
      Math.ceil(Math.sqrt(totalArea/targetFill)),
      Math.ceil(Math.sqrt(withIndex.length/targetFill))
    );

    let result=null;
    let attempts=0;

    while(n<=maxGrid&&attempts<96){
      attempts++;
      result=packAtN(withIndex,n,{sortMode,seed});
      if(!result.rejected.length){
        return {...result,attempts};
      }
      n=Math.max(n+1,Math.ceil(n*1.035));
    }

    n=Math.max(n,Math.ceil(Math.sqrt(totalArea))*2,maxSide*2);

    for(let i=0;i<64;i++){
      attempts++;
      result=packAtN(withIndex,n,{sortMode,seed});
      if(!result.rejected.length){
        return {...result,attempts};
      }
      n=Math.ceil(n*1.06)+1;
    }

    throw new Error(`square packing failed: ${result?.rejected?.length||withIndex.length} unplaced`);
  }

  W.ZZXMempoolTilesPacker=Object.freeze({
    __version:1,
    packAtN,
    pack
  });
})();
