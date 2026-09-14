(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicLayout?.__version>=6)return;

  function build(items,{mode="mosaic",seed=0}={}){
    const rows=W.ZZXMempoolMosaicSorter.sort(items,mode,seed);
    const prepared=rows.map((row,index)=>({...row,__sortIndex:index,__atlasWeight:W.ZZXMempoolMosaicSorter.metricWeight(row)}));
    const packed=W.ZZXMempoolMosaicPacker.pack(prepared,{seed});
    const leaves=packed.leaves.map((leaf,index)=>Object.freeze({...leaf,id:`${leaf.txid||leaf.id}:${leaf.__fragment?`f${leaf.__fragmentIndex||index}`:"p"}`,fragment:Boolean(leaf.__fragment)}));
    const byTxid=new Map();
    for(const leaf of leaves){const id=String(leaf.txid||"");if(!id)continue;if(!byTxid.has(id))byTxid.set(id,[]);byTxid.get(id).push(leaf)}
    return Object.freeze({
      mode,seed,root:packed.root,leaves:Object.freeze(leaves),tiles:Object.freeze(leaves),byTxid,
      sourceCount:packed.sourceCount,leafCount:packed.leafCount,fragmentCount:packed.fragmentCount,maxDepth:packed.maxDepth,coverage:packed.coverage
    });
  }

  function hit(layout,nx,ny){return W.ZZXMempoolMosaicPacker.hit(layout?.root,nx,ny)}

  W.ZZXMempoolMosaicLayout=Object.freeze({__version:6,build,hit});
})();
