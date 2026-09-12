// __partials/widgets/mempool-specs/js/block-layout.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsBlockLayout?.__version>=1)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function stableItems(items){
    return (Array.isArray(items)?items:[])
      .filter(item=>Number.isFinite(finite(item?.vbytes))&&finite(item.vbytes)>0)
      .slice()
      .sort((a,b)=>{
        const ar=finite(a.packageFeeRate??a.feeRate);
        const br=finite(b.packageFeeRate??b.feeRate);

        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br){
          return br-ar;
        }

        if(Number.isFinite(br)!==Number.isFinite(ar)){
          return Number.isFinite(br)?1:-1;
        }

        const av=finite(a.vbytes);
        const bv=finite(b.vbytes);

        if(av!==bv)return bv-av;
        return String(a.id).localeCompare(String(b.id));
      });
  }

  function worst(row,side,totalArea){
    if(!row.length||!(side>0)||!(totalArea>0))return Infinity;

    const areas=row.map(item=>item.__area);
    const sum=areas.reduce((s,v)=>s+v,0);
    const max=Math.max(...areas);
    const min=Math.min(...areas);

    if(!(sum>0)||!(min>0))return Infinity;

    const s2=sum*sum;
    const side2=side*side;

    return Math.max(
      side2*max/s2,
      s2/(side2*min)
    );
  }

  function layoutRow(row,rect,horizontal,out){
    const sum=row.reduce((s,item)=>s+item.__area,0);

    if(horizontal){
      const h=rect.w>0?sum/rect.w:0;
      let x=rect.x;

      for(const item of row){
        const w=h>0?item.__area/h:0;
        out.push({
          ...item,
          x,
          y:rect.y,
          w,
          h
        });
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
      out.push({
        ...item,
        x:rect.x,
        y,
        w,
        h
      });
      y+=h;
    }

    return {
      x:rect.x+w,
      y:rect.y,
      w:Math.max(0,rect.w-w),
      h:rect.h
    };
  }

  function squarify(items){
    const ordered=stableItems(items);

    if(!ordered.length){
      return [];
    }

    const totalWeight=ordered.reduce(
      (sum,item)=>sum+finite(item.vbytes),
      0
    );

    if(!(totalWeight>0)){
      return [];
    }

    const remaining=ordered.map(item=>({
      ...item,
      __area:finite(item.vbytes)/totalWeight
    }));

    let rect={x:0,y:0,w:1,h:1};
    let row=[];
    const out=[];

    while(remaining.length){
      const next=remaining[0];
      const side=Math.min(rect.w,rect.h);
      const currentWorst=worst(row,side,1);
      const nextWorst=worst(row.concat(next),side,1);

      if(!row.length||nextWorst<=currentWorst){
        row.push(remaining.shift());
        continue;
      }

      const horizontal=rect.w>=rect.h;
      rect=layoutRow(row,rect,horizontal,out);
      row=[];
    }

    if(row.length){
      const horizontal=rect.w>=rect.h;
      layoutRow(row,rect,horizontal,out);
    }

    return out;
  }

  function build(blockView){
    const tiles=squarify(blockView?.items||[]).map((tile,index)=>({
      ...tile,
      index,
      x:clamp(tile.x,0,1),
      y:clamp(tile.y,0,1),
      w:clamp(tile.w,0,1),
      h:clamp(tile.h,0,1)
    }));

    const byId=new Map(tiles.map(tile=>[tile.id,tile]));
    const gridN=128;
    const spatial=new Int32Array(gridN*gridN);

    for(let index=0;index<tiles.length;index++){
      const tile=tiles[index];
      const x0=clamp(Math.floor(tile.x*gridN),0,gridN-1);
      const y0=clamp(Math.floor(tile.y*gridN),0,gridN-1);
      const x1=clamp(Math.ceil((tile.x+tile.w)*gridN)-1,0,gridN-1);
      const y1=clamp(Math.ceil((tile.y+tile.h)*gridN)-1,0,gridN-1);

      for(let y=y0;y<=y1;y++){
        const offset=y*gridN;
        for(let x=x0;x<=x1;x++){
          spatial[offset+x]=index+1;
        }
      }
    }

    return {
      schema:"zzx-mempool-specs-block-layout-v1",
      tiles,
      byId,
      gridN,
      spatial,
      builtAt:Date.now()
    };
  }

  function find(layout,nx,ny){
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
    __version:1,
    stableItems,
    squarify,
    build,
    find
  });
})();
