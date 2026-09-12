// __partials/widgets/mempool-specs/js/priority-layout.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolSpecsPriorityLayout?.__version>=1)return;

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function hash32(s){
    const str=String(s||"");let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
    return h>>>0;
  }

  function median(values){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return NaN;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function sideFor(tx,baseline){
    if(!tx.detailed||tx.estimatedVbytes)return 1;
    const vb=finite(tx.vbytes);
    if(!Number.isFinite(vb)||vb<=0||!Number.isFinite(baseline)||baseline<=0)return 1;
    const ratio=vb/baseline;
    if(ratio<1.8)return 1;
    if(ratio<5)return 2;
    if(ratio<14)return 3;
    if(ratio<38)return 4;
    if(ratio<100)return 5;
    return 6;
  }

  function pack(items,n){
    const placed=[];
    let x=0,y=0,rowH=0;
    for(const item of items){
      let side=Math.min(item.side,n);
      if(x+side>n){x=0;y+=rowH;rowH=0}
      if(y+side>n)return null;
      placed.push({...item,x,y,side});
      x+=side;
      if(side>rowH)rowH=side;
    }
    return placed;
  }

  function build(model,{maxGrid=1400,fill=.88}={}){
    const rows=(model?.transactions||[]).slice();
    const measured=rows.map(x=>finite(x.vbytes)).filter(Number.isFinite);
    const baseline=median(measured)||finite(model?.averageVbytes)||500;

    // Preserve the model's package-aware priority order. Unknown-priority rows are
    // kept deterministic at the tail so refreshes do not randomly thrash the field.
    const known=rows.filter(x=>Number.isFinite(x.packageFeeRate)||Number.isFinite(x.projectedIndex));
    const unknown=rows.filter(x=>!Number.isFinite(x.packageFeeRate)&&!Number.isFinite(x.projectedIndex))
      .sort((a,b)=>hash32(a.txid)-hash32(b.txid));
    const ordered=known.concat(unknown);

    const items=ordered.map((tx,index)=>({tx,index,rank:index+1,side:sideFor(tx,baseline)}));
    const totalArea=items.reduce((s,x)=>s+x.side*x.side,0);
    let n=Math.max(16,Math.ceil(Math.sqrt(Math.max(1,totalArea)/fill)));
    n=Math.min(maxGrid,n);

    let placed=pack(items,n);
    while(!placed&&n<maxGrid){
      n=Math.min(maxGrid,Math.ceil(n*1.06+2));
      placed=pack(items,n);
    }

    if(!placed){
      // Guaranteed representation fallback: every transaction becomes one cell.
      n=Math.min(maxGrid,Math.max(16,Math.ceil(Math.sqrt(items.length/.92))));
      const one=items.map(x=>({...x,side:1}));
      placed=pack(one,n);
      if(!placed)throw new Error("transaction field exceeds visual grid capacity");
    }

    const hit=new Int32Array(n*n);
    const tiles=[];
    let cumulativeVbytes=0;
    let nextBoundary=1_000_000;
    const markers=[];

    for(let i=0;i<placed.length;i++){
      const p=placed[i];
      const tx=p.tx;
      const vb=finite(tx.vbytes);
      const usedVb=Number.isFinite(vb)&&vb>0?vb:(finite(model?.averageVbytes)||500);
      cumulativeVbytes+=usedVb;
      const projectedBlock=Math.max(1,Math.ceil(cumulativeVbytes/1_000_000));
      const tile={...tx,rank:p.rank,x:p.x,y:p.y,side:p.side,projectedBlock};
      tiles.push(tile);

      for(let yy=p.y;yy<p.y+p.side;yy++){
        const off=yy*n;
        for(let xx=p.x;xx<p.x+p.side;xx++)hit[off+xx]=i+1;
      }

      while(cumulativeVbytes>=nextBoundary&&markers.length<18){
        markers.push({
          block:markers.length+1,
          rank:p.rank,
          y:Math.min(n,p.y+p.side),
          cumulativeVbytes:nextBoundary
        });
        nextBoundary+=1_000_000;
      }
    }

    const byTxid=new Map(tiles.map(t=>[t.txid,t]));
    return {
      schema:"zzx-mempool-specs-layout-v1",
      gridN:n,
      tiles,
      hit,
      byTxid,
      markers,
      baselineVbytes:baseline,
      totalArea,
      builtAt:Date.now()
    };
  }

  function find(layout,nx,ny){
    if(!layout||!layout.hit||!layout.gridN)return null;
    if(!(nx>=0&&nx<1&&ny>=0&&ny<1))return null;
    const x=Math.min(layout.gridN-1,Math.floor(nx*layout.gridN));
    const y=Math.min(layout.gridN-1,Math.floor(ny*layout.gridN));
    const idx=layout.hit[y*layout.gridN+x]-1;
    return idx>=0?layout.tiles[idx]||null:null;
  }

  W.ZZXMempoolSpecsPriorityLayout=Object.freeze({__version:1,build,find,sideFor});
})();
