// mempool-mosaic/js/mosaic-packer.js
// v3 — 3x3-dominant exact-cover square mosaic geometry.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicPacker?.__version>=3)return;

  const EPS=1e-12;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  // Replacing one square with a 2x2 adds 3 leaves; replacing one with a 3x3
  // adds 8. Therefore every exact recursive mosaic has N = 1 + 3a + 8b.
  function representation(count,targetThreeRatio=.68){
    const n=Math.max(1,Math.floor(Number(count)||1));
    if(n===1)return {a:0,b:0,score:0};
    const remainder=n-1;
    let best=null;
    for(let b=0;b<=Math.floor(remainder/8);b++){
      const left=remainder-b*8;
      if(left<0||left%3)continue;
      const a=left/3;
      const ops=a+b;
      const ratio=ops?b/ops:0;
      // Mosaic intentionally favors 3x3 subdivision. A shallow penalty keeps
      // the result cellular instead of degenerating into one very deep branch.
      const score=Math.abs(ratio-targetThreeRatio)+(ops?Math.max(0,a-b)*.001:0);
      if(!best||score<best.score)best={a,b,score};
    }
    return best;
  }

  function isConstructible(count){return Boolean(representation(count));}

  function nextConstructible(count){
    const start=Math.max(1,Math.floor(Number(count)||1));
    for(let n=start;n<start+24;n++)if(isConstructible(n))return n;
    return start;
  }

  function cellOrder(grid,depth,seed){
    // Stable serpentine raster with deterministic quarter-turns. Unlike Tiles'
    // atlas ordering this produces locally coherent mosaic neighborhoods.
    const out=[];
    const rotate=(seed+depth)%4;
    for(let y=0;y<grid;y++){
      const reverse=(y+(seed&1))%2===1;
      for(let step=0;step<grid;step++){
        let x=reverse?grid-1-step:step;
        let yy=y,xx=x;
        if(rotate===1){xx=grid-1-y;yy=x;}
        else if(rotate===2){xx=grid-1-x;yy=grid-1-y;}
        else if(rotate===3){xx=y;yy=grid-1-x;}
        out.push({x:xx,y:yy});
      }
    }
    return out;
  }

  function distributeOperations(k,a,b,depth,seed){
    const bundles=Array.from({length:k},(_,index)=>({index,a:0,b:0,count:1}));
    const order=cellOrder(Math.round(Math.sqrt(k)),depth,seed).map(p=>p.y*Math.round(Math.sqrt(k))+p.x);
    const sequence=[];

    // 3x3 splits are placed first and spread spatially; 2x2 splits then fill
    // the remaining detail. This is deliberately different from Tiles' weighted
    // bundle allocator and creates the characteristic coarse mosaic texture.
    for(let i=0;i<b;i++)sequence.push({key:"b",inc:8,phase:i});
    for(let i=0;i<a;i++)sequence.push({key:"a",inc:3,phase:i+b});

    for(const op of sequence){
      let winner=order[op.phase%order.length]??0;
      let best=Infinity;
      for(let j=0;j<k;j++){
        const idx=order[(op.phase+j)%order.length]??j;
        const bundle=bundles[idx];
        // Prefer shallower bundles to avoid hairline cells and keep the mosaic
        // visually distributed across the whole block.
        const score=bundle.count + (bundle.a+bundle.b)*.35 + j*1e-6;
        if(score<best){best=score;winner=idx;}
      }
      bundles[winner][op.key]++;
      bundles[winner].count+=op.inc;
    }
    return bundles;
  }

  function chooseGrid(a,b,depth,seed){
    if(b<=0)return 2;
    if(a<=0)return 3;
    // Strong 3x3 preference, with occasional 2x2 punctuation so leaf sizes are
    // varied enough to communicate transaction magnitude.
    return ((depth*5+(seed&7))%7)<5?3:2;
  }

  function buildNode(a,b,x,y,side,depth,seed,leaves,nodes){
    if(a<=0&&b<=0){
      const leaf={x,y,side,depth,children:null,item:null};
      leaves.push(leaf);
      nodes.push(leaf);
      return leaf;
    }

    let grid=chooseGrid(a,b,depth,seed);
    if(grid===3&&b<=0)grid=2;
    if(grid===2&&a<=0)grid=3;

    const nextA=a-(grid===2?1:0);
    const nextB=b-(grid===3?1:0);
    const k=grid*grid;
    const bundles=distributeOperations(k,nextA,nextB,depth,seed);
    const cells=cellOrder(grid,depth,seed);
    const childSide=side/grid;
    const children=[];
    const node={x,y,side,depth,grid,children,item:null};
    nodes.push(node);

    for(let i=0;i<k;i++){
      const cell=cells[i];
      const bundle=bundles[i];
      children.push(buildNode(
        bundle.a,bundle.b,
        x+cell.x*childSide,
        y+cell.y*childSide,
        childSide,
        depth+1,
        (Math.imul(seed^((i+1)*0x9e3779b1),1664525)+1013904223)>>>0,
        leaves,nodes
      ));
    }
    return node;
  }

  function hit(node,nx,ny){
    if(!node||nx<node.x-EPS||ny<node.y-EPS||nx>node.x+node.side+EPS||ny>node.y+node.side+EPS)return null;
    let current=node;
    while(current?.children?.length){
      let found=null;
      for(const child of current.children){
        if(nx>=child.x-EPS&&nx<=child.x+child.side+EPS&&ny>=child.y-EPS&&ny<=child.y+child.side+EPS){found=child;break;}
      }
      if(!found)break;
      current=found;
    }
    return current?.item||null;
  }

  function pack(count,{seed=0}={}){
    const sourceCount=Math.max(0,Math.floor(Number(count)||0));
    if(!sourceCount)return {root:null,leaves:[],nodes:[],sourceCount:0,leafCount:0,fragmentCount:0,maxDepth:0,coverage:0};
    const leafCount=nextConstructible(sourceCount);
    const plan=representation(leafCount);
    const leaves=[];
    const nodes=[];
    const root=buildNode(plan.a,plan.b,0,0,1,0,Number(seed)>>>0,leaves,nodes);
    const coverage=leaves.reduce((sum,leaf)=>sum+leaf.side*leaf.side,0);
    return {
      root,leaves,nodes,
      sourceCount,
      leafCount:leaves.length,
      fragmentCount:leaves.length-sourceCount,
      maxDepth:leaves.reduce((m,l)=>Math.max(m,l.depth||0),0),
      coverage:clamp(coverage,0,1+EPS),
      plan:{a:plan.a,b:plan.b,targetThreeRatio:.68}
    };
  }

  W.ZZXMempoolMosaicPacker=Object.freeze({
    __version:3,
    representation,
    isConstructible,
    nextConstructible,
    cellOrder,
    pack,
    hit
  });
})();
