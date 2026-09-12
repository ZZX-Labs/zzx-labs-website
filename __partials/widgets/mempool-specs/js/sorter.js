// __partials/widgets/mempool-specs/js/sorter.js
// v5 — priority-aware square ordering and compatibility packer
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Sorter?.__version>=5)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hash32(str,seed=0){
    const s=String(str||"");
    let h=(seed>>>0)^0x9e3779b9;
    for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),0x01000193);
    return h>>>0;
  }

  function priorityCompare(a,b){
    const ap=Number(a.projectedIndex),bp=Number(b.projectedIndex);
    const ah=Number.isFinite(ap),bh=Number.isFinite(bp);
    if(ah&&bh&&ap!==bp)return ap-bp;
    if(ah!==bh)return ah?-1:1;

    const ar=Number(a.packageFeeRate??a.feeRate);
    const br=Number(b.packageFeeRate??b.feeRate);
    const ak=Number.isFinite(ar),bk=Number.isFinite(br);
    if(ak&&bk&&ar!==br)return br-ar;
    if(ak!==bk)return ak?-1:1;

    const av=Number(a.vbytes),bv=Number(b.vbytes);
    if(Number.isFinite(av)&&Number.isFinite(bv)&&av!==bv)return bv-av;
    return String(a.txid).localeCompare(String(b.txid));
  }

  function stablePriority(items,seed=0){
    return (Array.isArray(items)?items:[]).slice().sort((a,b)=>{
      const p=priorityCompare(a,b);
      if(p)return p;
      return hash32(a.txid,seed)-hash32(b.txid,seed);
    });
  }

  function packSquares(items,grid,opts={}){
    const cols=Math.max(1,Math.floor(grid?.cols||1));
    const rows=Math.max(1,Math.floor(grid?.rows||1));
    const seed=Number.isFinite(opts.seed)?opts.seed|0:0;
    const minSide=clamp(Number(opts.minSide??1),1,64);
    const maxSide=clamp(Number(opts.maxSide??22),2,96);
    const occ=Array.from({length:rows},()=>new Uint8Array(cols));
    const placed=[],rejected=[];

    const arr=stablePriority(items,seed).map(it=>({
      ...it,
      side:clamp(Math.floor(Number(it.side)||1),minSide,Math.min(maxSide,cols,rows))
    }));

    function fits(x,y,s){
      if(x+s>cols||y+s>rows)return false;
      for(let yy=y;yy<y+s;yy++)for(let xx=x;xx<x+s;xx++)if(occ[yy][xx])return false;
      return true;
    }
    function mark(x,y,s){
      for(let yy=y;yy<y+s;yy++)for(let xx=x;xx<x+s;xx++)occ[yy][xx]=1;
    }

    for(const item of arr){
      let found=null;
      for(let s=item.side;s>=minSide&&!found;s--){
        for(let y=0;y<=rows-s&&!found;y++){
          for(let x=0;x<=cols-s;x++){
            if(fits(x,y,s)){found={x,y,side:s};break}
          }
        }
      }
      if(!found){rejected.push(item);continue}
      mark(found.x,found.y,found.side);
      placed.push({...item,...found});
    }

    return {placed,rejected,cols,rows};
  }

  NS.Sorter=Object.freeze({
    __version:5,
    hash32,
    priorityCompare,
    stablePriority,
    packSquares
  });
})();
