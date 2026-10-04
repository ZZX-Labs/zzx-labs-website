// __partials/widgets/mempool-tiles/js/packer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesPacker?.__version>=3)return;

  const S=()=>W.ZZXMempoolTilesSorter;
  const GOLDEN_ANGLE=2.399963229728653;

  function nextPow2(value){
    let n=1;
    const target=Math.max(1,Math.ceil(Number(value)||1));
    while(n<target)n<<=1;
    return n;
  }

  function hilbertD2XY(n,d){
    let x=0;
    let y=0;
    let t=Math.max(0,Math.floor(Number(d)||0));

    for(let s=1;s<n;s<<=1){
      const rx=1&(t>>1);
      const ry=1&(t^rx);

      if(ry===0){
        if(rx===1){
          x=s-1-x;
          y=s-1-y;
        }

        const tmp=x;
        x=y;
        y=tmp;
      }

      x+=s*rx;
      y+=s*ry;
      t>>=2;
    }

    return [x,y];
  }

  function isFree(occupancy,n,x,y,side){
    for(let yy=y;yy<y+side;yy++){
      const offset=yy*n+x;

      for(let xx=0;xx<side;xx++){
        if(occupancy[offset+xx])return false;
      }
    }

    return true;
  }

  function occupy(occupancy,n,x,y,side){
    for(let yy=y;yy<y+side;yy++){
      const offset=yy*n+x;

      for(let xx=0;xx<side;xx++){
        occupancy[offset+xx]=1;
      }
    }
  }

  function targets(items,n,sortMode,seed){
    const arranged=S().sort(items,sortMode,seed);
    const count=arranged.length;
    const order=nextPow2(Math.ceil(Math.sqrt(Math.max(1,count))));
    const span=Math.max(1,order*order-1);
    const map=new Map();

    arranged.forEach((row,index)=>{
      const d=count<=1
        ? 0
        : Math.round(index*span/(count-1));

      const [hx,hy]=hilbertD2XY(order,d);
      const hash=S().hash32(row.txid||row.id,seed);

      // Tiny deterministic jitter keeps equally sized neighborhoods from
      // looking machine-striped while preserving the selected sort topology.
      const jx=((hash&255)/255-.5)*.42;
      const jy=(((hash>>>8)&255)/255-.5)*.42;

      const tx=Math.max(
        0,
        Math.min(
          n-1,
          Math.floor(((hx+.5+jx)/order)*n)
        )
      );

      const ty=Math.max(
        0,
        Math.min(
          n-1,
          Math.floor(((hy+.5+jy)/order)*n)
        )
      );

      map.set(
        row.txid||row.id,
        {
          x:tx,
          y:ty,
          sortIndex:index
        }
      );
    });

    return map;
  }

  function probePlace(
    occupancy,
    n,
    item,
    target,
    seed,
    probes
  ){
    const side=Math.max(
      1,
      Math.min(
        n,
        Math.floor(Number(item.side)||1)
      )
    );

    const maxX=n-side;
    const maxY=n-side;

    const bx=Math.max(
      0,
      Math.min(
        maxX,
        Math.round(target.x-side/2)
      )
    );

    const by=Math.max(
      0,
      Math.min(
        maxY,
        Math.round(target.y-side/2)
      )
    );

    const hash=S().hash32(item.txid||item.id,seed);
    const phase=(hash%100000)/100000*Math.PI*2;

    for(let k=0;k<probes;k++){
      let x=bx;
      let y=by;

      if(k>0){
        /*
         * Golden-angle search creates a tight local scatter around the
         * transaction's Hilbert target. This eliminates the long horizontal
         * shelves produced by the old skyline packer.
         */
        const t=k/Math.max(1,probes-1);
        const radius=Math.pow(t,.56)*n*.46;
        const angle=phase+k*GOLDEN_ANGLE;

        x=Math.max(
          0,
          Math.min(
            maxX,
            Math.round(bx+Math.cos(angle)*radius)
          )
        );

        y=Math.max(
          0,
          Math.min(
            maxY,
            Math.round(by+Math.sin(angle)*radius)
          )
        );
      }

      if(isFree(occupancy,n,x,y,side)){
        return {x,y,side};
      }
    }

    /*
     * Deterministic full-grid fallback. It is rarely reached at the normal
     * ~78% target occupancy, but guarantees that no candidate transaction is
     * silently dropped just because its preferred neighborhood is crowded.
     */
    const total=n*n;
    const start=hash%total;

    for(let offset=0;offset<total;offset++){
      const pos=(start+offset)%total;
      const x=pos%n;
      const y=Math.floor(pos/n);

      if(x>maxX||y>maxY)continue;

      if(isFree(occupancy,n,x,y,side)){
        return {x,y,side};
      }
    }

    return null;
  }

  function packAtN(items,n,{
    sortMode="priority",
    seed=0,
    probes=320
  }={}){
    const gridN=Math.max(1,Math.floor(Number(n)||1));
    const occupancy=new Uint8Array(gridN*gridN);
    const targetMap=targets(items,gridN,sortMode,seed);
    const placed=[];
    const rejected=[];

    /*
     * Larger squares are allocated first so the field remains packable. Their
     * target coordinates still come from the selected arrangement, so sorting
     * remains spatially meaningful rather than collapsing into size bands.
     */
    const order=items.slice().sort((a,b)=>{
      const as=Math.max(1,Math.floor(Number(a.side)||1));
      const bs=Math.max(1,Math.floor(Number(b.side)||1));

      if(bs!==as)return bs-as;

      const ai=targetMap.get(a.txid||a.id)?.sortIndex ?? 0;
      const bi=targetMap.get(b.txid||b.id)?.sortIndex ?? 0;

      return ai-bi;
    });

    for(const item of order){
      const target=targetMap.get(item.txid||item.id) || {
        x:gridN/2,
        y:gridN/2,
        sortIndex:placed.length
      };

      const spot=probePlace(
        occupancy,
        gridN,
        item,
        target,
        seed,
        probes
      );

      if(!spot){
        rejected.push(item);
        continue;
      }

      occupy(
        occupancy,
        gridN,
        spot.x,
        spot.y,
        spot.side
      );

      placed.push({
        ...item,
        cellX:spot.x,
        cellY:spot.y,
        sideCells:spot.side,
        __sortIndex:target.sortIndex
      });
    }

    const occupiedCells=placed.reduce(
      (sum,row)=>
        sum+
        row.sideCells*row.sideCells,
      0
    );

    return {
      placed,
      rejected,
      gridN,
      occupiedCells,
      fillRatio:
        occupiedCells/(gridN*gridN)
    };
  }

  function pack(items,{
    targetFill=.78,
    maxGrid=560,
    sortMode="priority",
    seed=0,
    probes=320
  }={}){
    const rows=Array.isArray(items)
      ? items
      : [];

    if(!rows.length){
      return {
        placed:[],
        rejected:[],
        gridN:1,
        occupiedCells:0,
        fillRatio:0,
        attempts:0
      };
    }

    const totalArea=rows.reduce(
      (sum,row)=>{
        const side=Math.max(
          1,
          Math.floor(Number(row.side)||1)
        );

        return sum+side*side;
      },
      0
    );

    const maxSide=Math.max(
      ...rows.map(
        row=>Math.max(
          1,
          Math.floor(Number(row.side)||1)
        )
      )
    );

    let n=Math.max(
      maxSide,
      Math.ceil(
        Math.sqrt(
          totalArea/
          Math.max(.48,Math.min(.86,targetFill))
        )
      )
    );

    let result=null;
    let attempts=0;

    while(n<=maxGrid&&attempts<24){
      attempts++;

      result=packAtN(
        rows,
        n,
        {
          sortMode,
          seed,
          probes
        }
      );

      if(!result.rejected.length){
        return {
          ...result,
          attempts
        };
      }

      n=Math.max(
        n+1,
        Math.ceil(n*1.035)
      );
    }

    /*
     * Hard correctness fallback: grow only as far as needed. The contract is
     * one real candidate transaction = one square tile, never "best effort".
     */
    for(let i=0;i<32;i++){
      attempts++;

      result=packAtN(
        rows,
        n,
        {
          sortMode,
          seed,
          probes:Math.max(probes,480)
        }
      );

      if(!result.rejected.length){
        return {
          ...result,
          attempts
        };
      }

      n=Math.ceil(n*1.05)+1;
    }

    throw new Error(
      `Mempool Tiles could not place ${result?.rejected?.length||rows.length} transaction squares`
    );
  }

  W.ZZXMempoolTilesPacker=Object.freeze({
    __version:3,
    nextPow2,
    hilbertD2XY,
    isFree,
    targets,
    packAtN,
    pack
  });
})();
