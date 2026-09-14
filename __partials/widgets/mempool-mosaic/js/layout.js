// mempool-mosaic/js/layout.js
// v6 — metric-to-square mosaic adapter with local fee/priority neighborhoods.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicLayout?.__version>=6)return;

  const S=()=>W.ZZXMempoolMosaicScaler;
  const Sorter=()=>W.ZZXMempoolMosaicSorter;
  const P=()=>W.ZZXMempoolMosaicPacker;
  const EPS=1e-12;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function metric(tx,mode){
    const value=Number(S().metricValue(tx,mode));
    return Number.isFinite(value)?value:-Infinity;
  }

  function spatialCompare(a,b){
    // Serpentine scan by leaf center. It deliberately groups same-sized cells
    // into contiguous neighborhoods rather than the atlas-like placement used
    // by Mempool Tiles.
    const ay=Math.round((a.y+a.side/2)*1e9);
    const by=Math.round((b.y+b.side/2)*1e9);
    if(ay!==by)return ay-by;
    const row=Math.floor((a.y+a.side/2)*4096);
    const ax=a.x+a.side/2,bx=b.x+b.side/2;
    return row%2?bx-ax:ax-bx;
  }

  function groupLeaves(leaves){
    const ordered=leaves.slice().sort((a,b)=>b.side-a.side||spatialCompare(a,b));
    const groups=[];
    for(const leaf of ordered){
      const prior=groups.at(-1);
      if(prior&&Math.abs(prior.side-leaf.side)<EPS)prior.leaves.push(leaf);
      else groups.push({side:leaf.side,leaves:[leaf]});
    }
    return groups;
  }

  function neighborhoodOrder(rows,sortMode,seed){
    if(sortMode&&sortMode!=="mosaic")return Sorter().sort(rows,sortMode,seed);
    return rows.slice().sort((a,b)=>{
      const af=Number(a.packageFeeRate??a.feeRate);
      const bf=Number(b.packageFeeRate??b.feeRate);
      if(Number.isFinite(af)&&Number.isFinite(bf)&&bf!==af)return bf-af;
      const av=Number(a.valueSats),bv=Number(b.valueSats);
      if(Number.isFinite(av)&&Number.isFinite(bv)&&bv!==av)return bv-av;
      const ar=Number(a.rank),br=Number(b.rank);
      if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;
      return Sorter().hash32(a.txid,seed)-Sorter().hash32(b.txid,seed);
    });
  }

  function collectGuides(node,out=[]){
    if(!node?.children?.length)return out;
    if((node.depth||0)<=2)out.push({x:node.x,y:node.y,side:node.side,depth:node.depth,grid:node.grid});
    for(const child of node.children)collectGuides(child,out);
    return out;
  }

  function build(model,{scaleMode="value",sortMode="mosaic",seed=0}={}){
    const source=(model?.candidate||[]).filter(tx=>tx?.txid);
    if(!source.length){
      return {schema:"zzx-mempool-mosaic-v3",tiles:[],byTxid:new Map(),root:null,guides:[],sourceCount:0,leafCount:0,fragmentCount:0,levels:0,exactCover:true,coverage:0,scale:null,vsizeScale:null,scaleMode,sortMode,seed,builtAt:Date.now()};
    }

    const scale=S().makeScale(source,scaleMode);
    const vsizeScale=S().makeScale(source,"vsize");
    const packed=P().pack(source.length,{seed});
    const groups=groupLeaves(packed.leaves);

    // Size assignment is monotonic: larger selected metrics always consume a
    // leaf at least as large as a smaller metric. Equal-size leaves are then
    // ordered spatially by the selected neighborhood mode.
    const metricSorted=source.slice().sort((a,b)=>{
      const av=metric(a,scaleMode),bv=metric(b,scaleMode);
      if(bv!==av)return bv-av;
      return String(a.txid).localeCompare(String(b.txid));
    });

    const fragmentSource=metricSorted.slice().reverse();
    const tiles=[];
    let cursor=0,fragmentCursor=0;

    for(const group of groups){
      const realCount=Math.min(group.leaves.length,Math.max(0,source.length-cursor));
      const realRows=neighborhoodOrder(metricSorted.slice(cursor,cursor+realCount),sortMode,seed);
      cursor+=realCount;
      const leaves=group.leaves.slice().sort(spatialCompare);

      for(let i=0;i<leaves.length;i++){
        const leaf=leaves[i];
        const fragment=i>=realCount;
        const base=fragment
          ? fragmentSource[(fragmentCursor++)%fragmentSource.length]
          : realRows[i];
        const tile={
          ...base,
          x:leaf.x,y:leaf.y,side:leaf.side,
          cx:leaf.x+leaf.side/2,cy:leaf.y+leaf.side/2,
          area:leaf.side*leaf.side,
          footprint:S().normalized(base,scale),
          vsizeNorm:S().normalized(base,vsizeScale),
          leafDepth:Number(leaf.depth)||0,
          index:tiles.length,
          __fragment:fragment,
          __fragmentIndex:fragment?fragmentCursor:0
        };
        leaf.item=tile;
        tiles.push(tile);
      }
    }

    const byTxid=new Map();
    for(const tile of tiles)if(!tile.__fragment&&!byTxid.has(tile.txid))byTxid.set(tile.txid,tile);
    for(const tile of tiles)if(!byTxid.has(tile.txid))byTxid.set(tile.txid,tile);

    return {
      schema:"zzx-mempool-mosaic-v3",
      tiles,byTxid,root:packed.root,
      guides:collectGuides(packed.root),
      sourceCount:source.length,
      leafCount:tiles.length,
      fragmentCount:packed.fragmentCount,
      levels:packed.maxDepth,
      exactCover:true,
      coverage:clamp(packed.coverage,0,1),
      scale,vsizeScale,scaleMode,sortMode,seed,
      plan:packed.plan,
      builtAt:Date.now()
    };
  }

  function hit(layout,x,y){
    if(!layout?.root)return null;
    return P().hit(layout.root,clamp(Number(x)||0,0,1-Number.EPSILON),clamp(Number(y)||0,0,1-Number.EPSILON));
  }

  W.ZZXMempoolMosaicLayout=Object.freeze({__version:6,build,hit});
})();
