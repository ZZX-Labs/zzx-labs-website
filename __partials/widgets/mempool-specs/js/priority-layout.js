// __partials/widgets/mempool-specs/js/priority-layout.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolSpecsPriorityLayout?.__version>=2)return;

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

  function sideFor(tx,baseline,scaler){
    if(!tx?.detailed||tx?.estimatedVbytes)return 1;

    if(scaler?.sideCellsFromTx){
      const raw=scaler.sideCellsFromTx(tx);
      if(Number.isFinite(raw))return Math.max(1,Math.min(6,Math.round(raw)));
    }

    const vb=finite(tx?.vbytes);
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
      const side=Math.min(item.side,n);
      if(x+side>n){x=0;y+=rowH;rowH=0}
      if(y+side>n)return null;
      placed.push({...item,x,y,side});
      x+=side;
      rowH=Math.max(rowH,side);
    }

    return placed;
  }

  function orderedRows(model){
    const rows=(model?.transactions||[]).slice();
    const sorter=W.ZZXMempoolSpecs?.Sorter?.stablePriority;

    if(sorter)return sorter(rows,Number(model?.tipHeight)||0);

    const known=rows.filter(x=>Number.isFinite(x.packageFeeRate)||Number.isFinite(x.projectedIndex));
    const unknown=rows
      .filter(x=>!Number.isFinite(x.packageFeeRate)&&!Number.isFinite(x.projectedIndex))
      .sort((a,b)=>hash32(a.txid)-hash32(b.txid));

    return known.concat(unknown);
  }

  function build(model,{maxGrid=1800,fill=.88,scaler=null}={}){
    const ordered=orderedRows(model);
    const measured=ordered.map(x=>finite(x.vbytes)).filter(Number.isFinite);
    const baseline=median(measured)||finite(model?.averageVbytes)||500;

    const items=ordered.map((tx,index)=>({
      tx,
      index,
      rank:index+1,
      side:sideFor(tx,baseline,scaler)
    }));

    const totalArea=items.reduce((sum,item)=>sum+item.side*item.side,0);
    let n=Math.max(16,Math.ceil(Math.sqrt(Math.max(1,totalArea)/fill)));
    n=Math.min(maxGrid,n);

    let placed=pack(items,n);
    while(!placed&&n<maxGrid){
      n=Math.min(maxGrid,Math.ceil(n*1.055+2));
      placed=pack(items,n);
    }

    if(!placed){
      n=Math.min(maxGrid,Math.max(16,Math.ceil(Math.sqrt(items.length/.92))));
      placed=pack(items.map(item=>({...item,side:1})),n);
      if(!placed)throw new Error("transaction field exceeds visual grid capacity");
    }

    const hit=new Int32Array(n*n);
    const tiles=[];
    const markers=[];
    let cumulativeVbytes=0;
    let nextBoundary=1_000_000;

    for(let i=0;i<placed.length;i++){
      const p=placed[i];
      const tx=p.tx;
      const vb=finite(tx.vbytes);
      const usedVb=Number.isFinite(vb)&&vb>0
        ? vb
        : (finite(model?.averageVbytes)||500);

      cumulativeVbytes+=usedVb;
      const projectedBlock=Math.max(1,Math.ceil(cumulativeVbytes/1_000_000));

      const tile={
        ...tx,
        rank:p.rank,
        x:p.x,
        y:p.y,
        side:p.side,
        projectedBlock
      };

      tiles.push(tile);

      for(let yy=p.y;yy<p.y+p.side;yy++){
        const offset=yy*n;
        for(let xx=p.x;xx<p.x+p.side;xx++)hit[offset+xx]=i+1;
      }

      while(cumulativeVbytes>=nextBoundary&&markers.length<24){
        markers.push({
          block:markers.length+1,
          rank:p.rank,
          y:Math.min(n,p.y+p.side),
          cumulativeVbytes:nextBoundary
        });
        nextBoundary+=1_000_000;
      }
    }

    return {
      schema:"zzx-mempool-specs-layout-v2",
      gridN:n,
      tiles,
      hit,
      byTxid:new Map(tiles.map(tile=>[tile.txid,tile])),
      markers,
      baselineVbytes:baseline,
      totalArea,
      cumulativeVbytes,
      builtAt:Date.now()
    };
  }

  function find(layout,nx,ny){
    if(!layout?.hit||!layout?.gridN)return null;
    if(!(nx>=0&&nx<1&&ny>=0&&ny<1))return null;
    const x=Math.min(layout.gridN-1,Math.floor(nx*layout.gridN));
    const y=Math.min(layout.gridN-1,Math.floor(ny*layout.gridN));
    const idx=layout.hit[y*layout.gridN+x]-1;
    return idx>=0?layout.tiles[idx]||null:null;
  }

  W.ZZXMempoolSpecsPriorityLayout=Object.freeze({
    __version:2,
    build,
    find,
    sideFor,
    orderedRows
  });
})();
