// __partials/widgets/mempool-specs/js/block-layout.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsBlockLayout?.__version>=2)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function stableItems(items){
    return (Array.isArray(items)?items:[])
      .filter(item=>Number.isFinite(finite(item?.vbytes))&&finite(item.vbytes)>0)
      .slice()
      .sort((a,b)=>{
        if(a.__reserve)return 1;
        if(b.__reserve)return -1;

        const ar=finite(a.packageFeeRate??a.feeRate);
        const br=finite(b.packageFeeRate??b.feeRate);

        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return br-ar;
        if(Number.isFinite(ar)!==Number.isFinite(br))return Number.isFinite(br)?1:-1;

        const av=finite(a.vbytes);
        const bv=finite(b.vbytes);
        if(av!==bv)return bv-av;
        return String(a.id).localeCompare(String(b.id));
      });
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
    return Math.max(side2*max/sum2,sum2/(side2*min));
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
      return {x:rect.x,y:rect.y+h,w:rect.w,h:Math.max(0,rect.h-h)};
    }

    const w=rect.h>0?sum/rect.h:0;
    let y=rect.y;
    for(const item of row){
      const h=w>0?item.__area/w:0;
      out.push({...item,x:rect.x,y,w,h});
      y+=h;
    }
    return {x:rect.x+w,y:rect.y,w:Math.max(0,rect.w-w),h:rect.h};
  }

  function squarify(items,denominator){
    const ordered=stableItems(items);
    if(!ordered.length)return [];

    const total=Number.isFinite(denominator)&&denominator>0
      ? denominator
      : ordered.reduce((sum,item)=>sum+finite(item.vbytes),0);

    if(!(total>0))return [];

    const remaining=ordered.map(item=>({
      ...item,
      __area:finite(item.vbytes)/total
    }));

    let rect={x:0,y:0,w:1,h:1};
    let row=[];
    const out=[];

    while(remaining.length){
      const next=remaining[0];
      const side=Math.min(rect.w,rect.h);
      const currentWorst=worst(row,side);
      const nextWorst=worst(row.concat(next),side);

      if(!row.length||nextWorst<=currentWorst){
        row.push(remaining.shift());
        continue;
      }

      rect=layoutRow(row,rect,rect.w>=rect.h,out);
      row=[];
    }

    if(row.length)layoutRow(row,rect,rect.w>=rect.h,out);
    return out;
  }

  function build(blockView){
    const realItems=(blockView?.items||[])
      .filter(item=>item?.realTx!==false&&item?.txid)
      .map(item=>({...item,__reserve:false}));

    const actual=realItems.reduce((sum,item)=>sum+Math.max(0,finite(item.vbytes)||0),0);
    const target=Math.max(1,finite(blockView?.targetVbytes)||1_000_000);
    const denominator=Math.max(target,actual);
    const reserve=Math.max(0,denominator-actual);
    const source=realItems.slice();

    if(reserve>0){
      source.push({
        id:"__zzx-empty-reserve__",
        txid:"",
        __reserve:true,
        realTx:false,
        vbytes:reserve,
        feeRate:NaN,
        packageFeeRate:NaN
      });
    }

    const all=squarify(source,denominator).map((tile,index)=>({
      ...tile,
      index,
      x:clamp(tile.x,0,1),
      y:clamp(tile.y,0,1),
      w:clamp(tile.w,0,1),
      h:clamp(tile.h,0,1)
    }));

    const emptyRects=all.filter(tile=>tile.__reserve);
    const tiles=all.filter(tile=>!tile.__reserve);
    const byId=new Map(tiles.map(tile=>[tile.id,tile]));
    const byTxid=new Map(tiles.map(tile=>[tile.txid,tile]));
    const gridN=192;
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

    return {
      schema:"zzx-mempool-specs-block-layout-v2",
      tiles,
      emptyRects,
      byId,
      byTxid,
      gridN,
      spatial,
      denominatorVbytes:denominator,
      representedVbytes:actual,
      emptyVbytes:reserve,
      areaCoverage:denominator>0?actual/denominator:0,
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
      if(tile&&nx>=tile.x&&nx<=tile.x+tile.w&&ny>=tile.y&&ny<=tile.y+tile.h)return tile;
    }

    for(let i=layout.tiles.length-1;i>=0;i--){
      const tile=layout.tiles[i];
      if(nx>=tile.x&&nx<=tile.x+tile.w&&ny>=tile.y&&ny<=tile.y+tile.h)return tile;
    }

    return null;
  }

  W.ZZXMempoolSpecsBlockLayout=Object.freeze({
    __version:2,
    stableItems,
    squarify,
    build,
    find
  });
})();
