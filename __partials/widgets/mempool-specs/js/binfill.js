// __partials/widgets/mempool-specs/js/binfill.js
// v5 — deterministic non-overlapping square bin packer
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.BinFill?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hash32(str,seed=0){
    const s=String(str??"");
    let h=(seed>>>0)^0x811c9dc5;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
    return h>>>0;
  }

  function makeOcc(rows,cols){
    return Array.from({length:rows},()=>new Uint8Array(cols));
  }

  function canPlace(occ,cols,rows,x,y,side){
    if(x<0||y<0||x+side>cols||y+side>rows)return false;
    for(let yy=y;yy<y+side;yy++){
      for(let xx=x;xx<x+side;xx++)if(occ[yy][xx])return false;
    }
    return true;
  }

  function mark(occ,x,y,side,value=1){
    for(let yy=y;yy<y+side;yy++){
      for(let xx=x;xx<x+side;xx++)occ[yy][xx]=value;
    }
  }

  function skylineDropY(sky,x,side){
    let y=0;
    for(let i=0;i<side;i++)y=Math.max(y,sky[x+i]||0);
    return y;
  }

  function gapScan(occ,cols,rows,side){
    for(let y=0;y<=rows-side;y++){
      for(let x=0;x<=cols-side;x++){
        if(canPlace(occ,cols,rows,x,y,side))return {x,y};
      }
    }
    return null;
  }

  function pack(tiles,grid,opts={}){
    const cols=Math.max(1,Math.floor(grid?.cols||1));
    const rows=Math.max(1,Math.floor(grid?.rows||1));
    const seed=Number.isFinite(opts.seed)?opts.seed>>>0:0;
    const minSide=Math.max(1,Math.floor(finite(opts.minSide)||1));
    const maxSide=Math.max(minSide,Math.floor(finite(opts.maxSide)||Math.min(cols,rows)));
    const gapFill=opts.gapFill!==false;
    const gapMax=Math.max(1,Math.floor(finite(opts.gapFillSideMax)||4));

    const arr=(Array.isArray(tiles)?tiles:[]).map(tile=>({
      ...tile,
      side:clamp(Math.floor(finite(tile?.side)||1),minSide,Math.min(maxSide,cols,rows))
    }));

    arr.sort((a,b)=>{
      if(b.side!==a.side)return b.side-a.side;
      const af=finite(a.feeRate)||0,bf=finite(b.feeRate)||0;
      if(bf!==af)return bf-af;
      return hash32(a.txid,seed)-hash32(b.txid,seed);
    });

    const occ=makeOcc(rows,cols);
    const sky=new Uint32Array(cols);
    const placed=[],rejected=[];

    for(const tile of arr){
      const side=tile.side;
      let best=null;

      for(let x=0;x<=cols-side;x++){
        const y=skylineDropY(sky,x,side);
        if(y>rows-side)continue;
        if(best&&y>best.y)continue;
        if(canPlace(occ,cols,rows,x,y,side)){
          if(!best||y<best.y||(y===best.y&&x<best.x))best={x,y};
        }
      }

      if(!best&&gapFill&&side<=gapMax)best=gapScan(occ,cols,rows,side);
      if(!best){rejected.push(tile);continue}

      mark(occ,best.x,best.y,side,1);
      const top=best.y+side;
      for(let i=0;i<side;i++)sky[best.x+i]=Math.max(sky[best.x+i],top);
      placed.push({...tile,x:best.x,y:best.y});
    }

    return {placed,rejected,cols,rows};
  }

  NS.BinFill=Object.freeze({
    __version:5,
    pack
  });
})();
