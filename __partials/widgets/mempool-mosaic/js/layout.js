(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicLayout?.__version>=7)return;

  function primaryRows(rows){return Array.isArray(rows)?rows.filter(row=>row?.txid):[]}

  function build(items,{mode="mosaic",seed=0}={}){
    const rows=W.ZZXMempoolMosaicSorter.sort(primaryRows(items),mode,seed);
    const packed=W.ZZXMempoolMosaicPacker.pack(rows.length,{seed});
    if(!rows.length||!packed.leaves.length){
      return Object.freeze({mode,seed,root:packed.root,leaves:Object.freeze([]),tiles:Object.freeze([]),byTxid:new Map(),sourceCount:0,leafCount:0,fragmentCount:0,maxDepth:0,coverage:0});
    }

    // Reserve the smallest cells for unavoidable linked fragments. Every real
    // transaction receives one primary square; fragment cells repeat a real txid
    // only to preserve exact square coverage for non-constructible counts.
    const leaves=packed.leaves.map((leaf,index)=>({leaf,index}));
    const fragmentCount=Math.max(0,packed.leafCount-rows.length);
    const fragmentIndexes=new Set(
      leaves.slice().sort((a,b)=>a.leaf.side-b.leaf.side||b.leaf.depth-a.leaf.depth||a.index-b.index)
        .slice(0,fragmentCount).map(entry=>entry.index)
    );
    const primaryLeaves=leaves.filter(entry=>!fragmentIndexes.has(entry.index));
    const fragmentLeaves=leaves.filter(entry=>fragmentIndexes.has(entry.index));
    const byTxid=new Map();
    const rendered=[];

    function attach(entry,row,{fragment=false,fragmentIndex=0}={}){
      const base=entry.leaf;
      const tile=Object.freeze({...row,x:base.x,y:base.y,side:base.side,cx:base.x+base.side/2,cy:base.y+base.side/2,depth:base.depth,
        id:`${row.txid}:${fragment?`f${fragmentIndex}`:"p"}`,fragment,__fragment:fragment,__fragmentIndex:fragmentIndex});
      base.item=tile;
      rendered.push(tile);
      if(!byTxid.has(row.txid))byTxid.set(row.txid,[]);
      byTxid.get(row.txid).push(tile);
    }

    primaryLeaves.forEach((entry,index)=>attach(entry,rows[index]));
    if(fragmentLeaves.length){
      const donors=rows.slice().sort((a,b)=>W.ZZXMempoolMosaicSorter.metricWeight(a)-W.ZZXMempoolMosaicSorter.metricWeight(b));
      fragmentLeaves.forEach((entry,index)=>attach(entry,donors[index%donors.length],{fragment:true,fragmentIndex:index+1}));
    }

    // Keep renderer traversal deterministic even though fragment reservation was
    // size-based; the geometry itself remains the packer's recursive mosaic order.
    rendered.sort((a,b)=>a.y-b.y||a.x-b.x||b.side-a.side||String(a.txid).localeCompare(String(b.txid)));

    return Object.freeze({
      mode,seed,root:packed.root,leaves:Object.freeze(rendered),tiles:Object.freeze(rendered),byTxid,
      sourceCount:rows.length,leafCount:packed.leafCount,fragmentCount,maxDepth:packed.maxDepth,coverage:packed.coverage,
      plan:packed.plan
    });
  }

  function hit(layout,nx,ny){return W.ZZXMempoolMosaicPacker.hit(layout?.root,nx,ny)}
  W.ZZXMempoolMosaicLayout=Object.freeze({__version:7,build,hit});
})();
