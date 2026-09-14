// mempool-tiles/js/layout.js
// v4 — exact-cover square-only recursive tiling for projected next-block TXs.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLayout?.__version>=4)return;

  const Scaler=()=>W.ZZXMempoolTilesScaler;
  const Sorter=()=>W.ZZXMempoolTilesSorter;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hashUnit(text,seed=0){
    return Sorter().hash32(String(text||""),seed)/0xffffffff;
  }

  function solvePlan(n){
    const count=Math.max(0,Math.floor(Number(n)||0));
    if(count===0)return {base:0,quad:0,nine:0,exact:true};

    const bases=count>=6?[1,6]:[1];
    let best=null;

    for(const base of bases){
      const rem=count-base;
      if(rem<0)continue;

      for(let nine=0;nine<=Math.min(8,Math.floor(rem/8));nine++){
        const rest=rem-nine*8;
        if(rest<0||rest%3)continue;
        const quad=rest/3;
        const cost=quad+nine*1.35+(base===6?.2:0);
        if(!best||cost<best.cost){
          best={base,quad,nine,cost,exact:true};
        }
      }
    }

    if(best)return best;
    return {base:1,quad:0,nine:0,exact:false};
  }

  function node(x,y,side,path,depth=0,parent=null){
    return {x,y,side,path,depth,parent,children:null,tile:null};
  }

  function baseLeaves(base){
    if(base===6){
      const root=node(0,0,1,"r",0,null);
      const s=1/3;
      const leaves=[
        node(0,0,2*s,"r0",1,root),
        node(2*s,0,s,"r1",1,root),
        node(2*s,s,s,"r2",1,root),
        node(0,2*s,s,"r3",1,root),
        node(s,2*s,s,"r4",1,root),
        node(2*s,2*s,s,"r5",1,root)
      ];
      root.children=leaves;
      return {root,leaves};
    }

    const root=node(0,0,1,"r",0,null);
    return {root,leaves:[root]};
  }

  function splitLeaf(leaf,k){
    const children=[];
    const s=leaf.side/k;
    let index=0;

    for(let yy=0;yy<k;yy++){
      for(let xx=0;xx<k;xx++){
        children.push(
          node(
            leaf.x+xx*s,
            leaf.y+yy*s,
            s,
            `${leaf.path}.${k}${index++}`,
            leaf.depth+1,
            leaf
          )
        );
      }
    }

    leaf.children=children;
    leaf.tile=null;
    return children;
  }

  function seededRng(seed){
    let state=(Number(seed)>>>0)||0x6d2b79f5;
    return ()=>{
      state=(state+0x6d2b79f5)>>>0;
      let t=state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function chooseSplitLeaf(leaves,rng){
    if(leaves.length===1)return 0;

    let total=0;
    const weights=new Float64Array(leaves.length);

    for(let i=0;i<leaves.length;i++){
      const leaf=leaves[i];
      const area=leaf.side*leaf.side;
      const depthPenalty=1+leaf.depth*.055;
      const w=Math.pow(area,1.18)/depthPenalty;
      weights[i]=w;
      total+=w;
    }

    let needle=rng()*total;
    for(let i=0;i<weights.length;i++){
      needle-=weights[i];
      if(needle<=0)return i;
    }
    return weights.length-1;
  }

  function createExactTree(count,seed){
    const plan=solvePlan(count);

    if(!plan.exact){
      return {root:null,leaves:[],plan};
    }

    const {root,leaves}=baseLeaves(plan.base);
    const rng=seededRng((Number(seed)||0)^count^0x4d54534c);

    // Nine-way splits first add a small amount of visual granularity without
    // changing the exact-cover property. The remainder is built with quads.
    const arities=[
      ...Array(plan.nine).fill(3),
      ...Array(plan.quad).fill(2)
    ];

    for(const k of arities){
      const index=chooseSplitLeaf(leaves,rng);
      const leaf=leaves[index];
      const children=splitLeaf(leaf,k);
      leaves.splice(index,1,...children);
    }

    return {root,leaves,plan};
  }

  function fallbackGrid(items,scaleMode,sortMode,seed){
    const ordered=Sorter().sort(items,sortMode,seed);
    const n=Math.max(1,Math.ceil(Math.sqrt(ordered.length)));
    const side=1/n;
    const tiles=ordered.map((tx,index)=>({
      ...tx,
      x:(index%n)*side,
      y:Math.floor(index/n)*side,
      side,
      cx:(index%n+.5)*side,
      cy:(Math.floor(index/n)+.5)*side,
      area:side*side,
      leafDepth:1,
      leafPath:`fallback.${index}`,
      index
    }));
    return {
      schema:"zzx-mempool-tiles-square-cover-v4-fallback",
      tiles,
      byTxid:new Map(tiles.map(t=>[t.txid,t])),
      root:null,
      leafCount:tiles.length,
      levels:1,
      exactCover:false,
      coverage:ordered.length/(n*n),
      scaleMode,
      sortMode,
      seed,
      builtAt:Date.now(),
      scale:Scaler().makeScale(ordered,scaleMode)
    };
  }

  function spatialOrder(a,b,seed){
    // Coarse row-major ordering plus deterministic jitter within equal bands.
    const ay=Math.round(a.y*1e9);
    const by=Math.round(b.y*1e9);
    if(ay!==by)return ay-by;
    const ax=Math.round(a.x*1e9);
    const bx=Math.round(b.x*1e9);
    if(ax!==bx)return ax-bx;
    return hashUnit(a.path,seed)-hashUnit(b.path,seed);
  }

  function groupLeavesBySide(leaves){
    const groups=[];
    const sorted=leaves.slice().sort((a,b)=>b.side-a.side||a.y-b.y||a.x-b.x);

    for(const leaf of sorted){
      const prior=groups.at(-1);
      if(prior&&Math.abs(prior.side-leaf.side)<1e-12){
        prior.leaves.push(leaf);
      }else{
        groups.push({side:leaf.side,leaves:[leaf]});
      }
    }
    return groups;
  }

  function build(model,{scaleMode="vsize",sortMode="priority",seed=0}={}){
    const source=(model?.candidate||[]).filter(tx=>tx?.txid);

    if(!source.length){
      return {
        schema:"zzx-mempool-tiles-square-cover-v4",
        tiles:[],
        byTxid:new Map(),
        root:null,
        leafCount:0,
        levels:0,
        exactCover:true,
        coverage:0,
        scale:null,
        scaleMode,
        sortMode,
        seed,
        builtAt:Date.now()
      };
    }

    const tree=createExactTree(source.length,seed);
    if(!tree.plan.exact){
      return fallbackGrid(source,scaleMode,sortMode,seed);
    }

    const scale=Scaler().makeScale(source,scaleMode);
    const metricSorted=source.slice().sort((a,b)=>{
      const av=Scaler().metricValue(a,scaleMode);
      const bv=Scaler().metricValue(b,scaleMode);
      const aa=Number.isFinite(av)?av:-Infinity;
      const bb=Number.isFinite(bv)?bv:-Infinity;
      if(bb!==aa)return bb-aa;
      return String(a.txid).localeCompare(String(b.txid));
    });

    const leafGroups=groupLeavesBySide(tree.leaves);
    const tiles=[];
    let cursor=0;

    for(const group of leafGroups){
      const count=group.leaves.length;
      const txGroup=metricSorted.slice(cursor,cursor+count);
      cursor+=count;

      const orderedTx=Sorter().sort(txGroup,sortMode,seed);
      const orderedLeaves=group.leaves.slice().sort((a,b)=>spatialOrder(a,b,seed));

      for(let i=0;i<orderedTx.length;i++){
        const tx=orderedTx[i];
        const leaf=orderedLeaves[i];
        const tile={
          ...tx,
          x:leaf.x,
          y:leaf.y,
          side:leaf.side,
          cx:leaf.x+leaf.side/2,
          cy:leaf.y+leaf.side/2,
          area:leaf.side*leaf.side,
          leafDepth:leaf.depth,
          leafPath:leaf.path,
          footprint:Scaler().normalized(tx,scale),
          index:tiles.length
        };
        leaf.tile=tile;
        tiles.push(tile);
      }
    }

    const byTxid=new Map(tiles.map(tile=>[tile.txid,tile]));
    const levels=tiles.reduce((m,t)=>Math.max(m,t.leafDepth||0),0);

    return {
      schema:"zzx-mempool-tiles-square-cover-v4",
      tiles,
      byTxid,
      root:tree.root,
      leafCount:tiles.length,
      levels,
      exactCover:true,
      coverage:1,
      scale,
      scaleMode,
      sortMode,
      seed,
      builtAt:Date.now(),
      plan:tree.plan
    };
  }

  function inside(tile,x,y){
    return x>=tile.x&&y>=tile.y&&x<=tile.x+tile.side&&y<=tile.y+tile.side;
  }

  function hitNode(current,x,y){
    if(!current)return null;
    if(current.children?.length){
      for(const child of current.children){
        if(x>=child.x&&y>=child.y&&x<=child.x+child.side&&y<=child.y+child.side){
          return hitNode(child,x,y);
        }
      }
      return null;
    }
    return current.tile||null;
  }

  function hit(layout,x,y){
    const nx=clamp(Number(x)||0,0,1-Number.EPSILON);
    const ny=clamp(Number(y)||0,0,1-Number.EPSILON);

    if(layout?.root){
      return hitNode(layout.root,nx,ny);
    }

    // Bootstrap fallback for mathematically non-tileable tiny counts.
    for(const tile of layout?.tiles||[]){
      if(inside(tile,nx,ny))return tile;
    }
    return null;
  }

  W.ZZXMempoolTilesLayout=Object.freeze({
    __version:4,
    solvePlan,
    createExactTree,
    build,
    hit
  });
})();
