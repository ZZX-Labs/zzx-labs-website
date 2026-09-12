// __partials/widgets/mempool-specs/js/block-layout.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsBlockLayout?.__version>=4)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function quantile(sorted,q){
    if(!sorted.length)return NaN;
    const p=clamp(Number(q)||0,0,1)*(sorted.length-1);
    const lo=Math.floor(p);
    const hi=Math.ceil(p);
    if(lo===hi)return sorted[lo];
    const t=p-lo;
    return sorted[lo]+(sorted[hi]-sorted[lo])*t;
  }

  /*
   * Exact linear BTC-value area is visually pathological because Bitcoin
   * transaction values are extremely heavy-tailed. One sweep can be orders of
   * magnitude larger than thousands of ordinary payments. The old layout fed
   * those values to squarify in projected-rank order, which is precisely how
   * the "thin strips across the top" failure was produced.
   *
   * Specs keeps value as the only size signal, but uses a perceptual power
   * transform after robust clipping. Larger-value transactions are always
   * larger; the transform simply keeps the entire candidate block legible.
   */
  function makeValueScale(items){
    const values=(Array.isArray(items)?items:[])
      .map(item=>finite(item?.valueSats))
      .filter(value=>Number.isFinite(value)&&value>0)
      .sort((a,b)=>a-b);

    const median=values.length?quantile(values,.50):1;
    const low=values.length?Math.max(1,quantile(values,.02)):1;
    const high=values.length?Math.max(low,quantile(values,.985)):Math.max(1,median);
    const exponent=.30;

    return {
      values,
      known:values.length,
      median:Math.max(1,median||1),
      low,
      high,
      exponent,
      fallbackWeight:1
    };
  }

  function displayWeight(value,scale){
    const n=finite(value);

    if(!Number.isFinite(n)||n<0){
      // A real transaction whose full output-value detail has not arrived yet.
      // Keep it visible and clickable; its tile will resize when hydration lands.
      return scale.fallbackWeight;
    }

    const clamped=clamp(Math.max(1,n),scale.low,scale.high);
    const normalized=clamped/Math.max(1,scale.median);
    return Math.pow(normalized,scale.exponent);
  }

  function worst(row,side){
    if(!row.length||!(side>0))return Infinity;

    const areas=row.map(item=>item.__area);
    const sum=areas.reduce((s,v)=>s+v,0);
    const max=Math.max(...areas);
    const min=Math.min(...areas);

    if(!(sum>0)||!(min>0))return Infinity;

    const sum2=sum*sum;
    const side2=side*side;
    return Math.max(
      side2*max/sum2,
      sum2/(side2*min)
    );
  }

  function layoutRow(row,rect,horizontal,out){
    const sum=row.reduce((s,item)=>s+item.__area,0);

    if(horizontal){
      const h=rect.w>0?sum/rect.w:0;
      let x=rect.x;

      for(const item of row){
        const w=h>0?item.__area/h:0;
        out.push({...item,x,y:rect.y,w,h});
        x+=w;
      }

      return {
        x:rect.x,
        y:rect.y+h,
        w:rect.w,
        h:Math.max(0,rect.h-h)
      };
    }

    const w=rect.h>0?sum/rect.h:0;
    let y=rect.y;

    for(const item of row){
      const h=w>0?item.__area/w:0;
      out.push({...item,x:rect.x,y,w,h});
      y+=h;
    }

    return {
      x:rect.x+w,
      y:rect.y,
      w:Math.max(0,rect.w-w),
      h:rect.h
    };
  }

  /*
   * Standard squarify requires descending area order. Never feed it projected
   * rank order: doing so makes tiny early items form long slivers.
   */
  function squarify(items,totalWeight){
    if(!items.length||!(totalWeight>0))return [];

    const remaining=items
      .map(item=>({
        ...item,
        __area:item.__weight/totalWeight
      }))
      .sort((a,b)=>{
        if(b.__area!==a.__area)return b.__area-a.__area;

        const ar=finite(a.projectedRank);
        const br=finite(b.projectedRank);
        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;

        return String(a.txid||a.id||"").localeCompare(String(b.txid||b.id||""));
      });

    let rect={x:0,y:0,w:1,h:1};
    let row=[];
    const out=[];

    while(remaining.length){
      const next=remaining[0];
      const side=Math.max(1e-12,Math.min(rect.w,rect.h));
      const currentWorst=worst(row,side);
      const nextWorst=worst(row.concat(next),side);

      if(!row.length||nextWorst<=currentWorst){
        row.push(remaining.shift());
      }else{
        rect=layoutRow(row,rect,rect.w<rect.h,out);
        row=[];
      }
    }

    if(row.length)layoutRow(row,rect,rect.w<rect.h,out);
    return out;
  }

  function build(blockView){
    const sourceItems=(blockView?.items||[])
      .filter(item=>item?.realTx!==false&&item?.txid);

    if(!sourceItems.length){
      return {
        schema:"zzx-mempool-specs-block-layout-v4",
        tiles:[],
        emptyRects:[],
        byId:new Map(),
        byTxid:new Map(),
        gridN:512,
        spatial:new Int32Array(512*512),
        totalValueSats:finite(blockView?.totalValueSats),
        valueKnownCount:0,
        valueCoverage:0,
        vsizeCoverage:clamp(finite(blockView?.coverage)||0,0,1),
        visualCoverage:0,
        valueScale:null,
        builtAt:Date.now()
      };
    }

    const scale=makeValueScale(sourceItems);

    const weighted=sourceItems.map(item=>{
      const value=finite(item.valueSats);
      const valueKnown=Number.isFinite(value)&&value>=0;

      return {
        ...item,
        valueKnown,
        __weight:displayWeight(value,scale)
      };
    });

    /*
     * Unknown-value real transactions must not disappear. Give them the median
     * transformed weight, then let the live detail fetch resize them accurately.
     */
    const knownWeights=weighted
      .filter(item=>item.valueKnown)
      .map(item=>item.__weight)
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);

    const fallback=knownWeights.length
      ? Math.max(.25,quantile(knownWeights,.50))
      : 1;

    for(const item of weighted){
      if(!item.valueKnown)item.__weight=fallback;
    }

    const totalWeight=weighted.reduce(
      (sum,item)=>sum+(finite(item.__weight)||0),
      0
    );

    const all=squarify(weighted,totalWeight).map((tile,index)=>({
      ...tile,
      index,
      x:clamp(tile.x,0,1),
      y:clamp(tile.y,0,1),
      w:clamp(tile.w,0,1),
      h:clamp(tile.h,0,1),
      rawValueShare:
        Number.isFinite(tile.valueSats)&&Number.isFinite(blockView?.totalValueSats)&&blockView.totalValueSats>0
          ? tile.valueSats/blockView.totalValueSats
          : NaN
    }));

    const tiles=all;
    const byId=new Map(tiles.map(tile=>[tile.id,tile]));
    const byTxid=new Map(tiles.map(tile=>[tile.txid,tile]));

    /*
     * 512² hit grid keeps thousands of very small real transactions clickable.
     * Later tiles only win a cell when their center is actually within it.
     */
    const gridN=512;
    const spatial=new Int32Array(gridN*gridN);

    for(let index=0;index<tiles.length;index++){
      const tile=tiles[index];
      const x0=clamp(Math.floor(tile.x*gridN),0,gridN-1);
      const y0=clamp(Math.floor(tile.y*gridN),0,gridN-1);
      const x1=clamp(Math.ceil((tile.x+tile.w)*gridN)-1,0,gridN-1);
      const y1=clamp(Math.ceil((tile.y+tile.h)*gridN)-1,0,gridN-1);

      for(let y=y0;y<=y1;y++){
        const offset=y*gridN;
        for(let x=x0;x<=x1;x++)spatial[offset+x]=index+1;
      }
    }

    const valueKnownCount=tiles.filter(item=>item.valueKnown).length;

    return {
      schema:"zzx-mempool-specs-block-layout-v4",
      tiles,
      emptyRects:[],
      byId,
      byTxid,
      gridN,
      spatial,
      totalValueSats:finite(blockView?.totalValueSats),
      valueKnownCount,
      valueCoverage:tiles.length?valueKnownCount/tiles.length:0,
      vsizeCoverage:clamp(finite(blockView?.coverage)||0,0,1),
      visualCoverage:tiles.length?1:0,
      valueScale:{
        mode:"btc-output-value-perceptual",
        exponent:scale.exponent,
        lowSats:scale.low,
        medianSats:scale.median,
        highSats:scale.high
      },
      builtAt:Date.now()
    };
  }

  function find(layout,nx,ny){
    if(!layout?.spatial||!(nx>=0&&nx<1&&ny>=0&&ny<1))return null;

    const n=layout.gridN;
    const x=clamp(Math.floor(nx*n),0,n-1);
    const y=clamp(Math.floor(ny*n),0,n-1);
    const index=layout.spatial[y*n+x]-1;

    if(index>=0){
      const tile=layout.tiles[index];

      if(
        tile &&
        nx>=tile.x &&
        nx<=tile.x+tile.w &&
        ny>=tile.y &&
        ny<=tile.y+tile.h
      ){
        return tile;
      }
    }

    // Exact fallback for sub-cell slivers at extreme zoom distributions.
    for(let i=layout.tiles.length-1;i>=0;i--){
      const tile=layout.tiles[i];

      if(
        nx>=tile.x &&
        nx<=tile.x+tile.w &&
        ny>=tile.y &&
        ny<=tile.y+tile.h
      ){
        return tile;
      }
    }

    return null;
  }

  W.ZZXMempoolSpecsBlockLayout=Object.freeze({
    __version:4,
    quantile,
    makeValueScale,
    displayWeight,
    squarify,
    build,
    find
  });
})();
