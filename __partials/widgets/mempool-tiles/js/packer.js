// Exact square-dissection atlas. Every leaf is square; the root has no gaps.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesPacker?.__version>=5)return;

  const EPS=1e-12;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function representation(count,targetThreeRatio=.22){
    const n=Math.max(1,Math.floor(Number(count)||1));
    if(n===1)return {a:0,b:0};

    const remainder=n-1;
    let best=null;

    for(let b=0;b<=Math.floor(remainder/8);b++){
      const left=remainder-b*8;
      if(left<0||left%3)continue;
      const a=left/3;
      const operations=a+b;
      const ratio=operations?b/operations:0;
      const score=Math.abs(ratio-targetThreeRatio)+(a===0?.025:0);

      if(!best||score<best.score)best={a,b,score};
    }

    return best&&{a:best.a,b:best.b};
  }

  function isConstructible(count){
    return Boolean(representation(count));
  }

  function nextConstructible(count){
    const start=Math.max(1,Math.floor(Number(count)||1));
    for(let n=start;n<start+24;n++){
      if(isConstructible(n))return n;
    }
    return start;
  }

  function finiteWeight(row){
    const n=Number(row?.__atlasWeight);
    return Number.isFinite(n)&&n>0?n:EPS;
  }

  function distributeBundles(k,a,b,rows){
    const bundles=Array.from({length:k},()=>({a:0,b:0,count:1}));
    const weights=rows.map(finiteWeight).sort((x,y)=>y-x);
    const total=weights.reduce((sum,value)=>sum+value,0);
    const equalShare=total/Math.max(1,k);

    let singletonCount=0;
    const maxSingletons=Math.max(0,Math.min(k-1,rows.length-1));

    while(
      singletonCount<maxSingletons&&
      weights[singletonCount]>=equalShare*.82
    )singletonCount++;

    const active=[];
    for(let index=singletonCount;index<k;index++)active.push(index);
    if(!active.length)active.push(k-1);

    const operations=[
      ...Array.from({length:b},()=>({key:"b",increment:8})),
      ...Array.from({length:a},()=>({key:"a",increment:3}))
    ];

    for(const operation of operations){
      let winner=active[0];

      for(const index of active){
        const candidateAfter=bundles[index].count+operation.increment;
        const chosenAfter=bundles[winner].count+operation.increment;

        if(candidateAfter<chosenAfter||(candidateAfter===chosenAfter&&index<winner)){
          winner=index;
        }
      }

      bundles[winner][operation.key]++;
      bundles[winner].count+=operation.increment;
    }

    return bundles;
  }

  function assignRows(rows,bundles){
    const ordered=rows.slice().sort((a,b)=>{
      const difference=finiteWeight(b)-finiteWeight(a);
      if(Math.abs(difference)>EPS)return difference;
      return Number(a.__sortIndex||0)-Number(b.__sortIndex||0);
    });

    const bins=bundles.map((bundle,index)=>({
      ...bundle,
      index,
      rows:[],
      load:0,
      remaining:bundle.count
    }));

    const seedOrder=bins.slice().sort((a,b)=>a.count-b.count||a.index-b.index);

    for(const bin of seedOrder){
      const row=ordered.shift();
      if(!row)break;
      bin.rows.push(row);
      bin.load+=finiteWeight(row);
      bin.remaining--;
    }

    const target=rows.reduce((sum,row)=>sum+finiteWeight(row),0)/Math.max(1,bins.length);

    for(const row of ordered){
      let winner=null;
      let winnerScore=Infinity;

      for(const bin of bins){
        if(bin.remaining<=0)continue;
        const loadRatio=(bin.load+finiteWeight(row))/Math.max(EPS,target);
        const occupancyRatio=bin.rows.length/Math.max(1,bin.count);
        const score=loadRatio+occupancyRatio*.035+bin.index*1e-9;

        if(score<winnerScore){
          winner=bin;
          winnerScore=score;
        }
      }

      if(!winner)winner=bins.find(bin=>bin.remaining>0)||bins.at(-1);
      winner.rows.push(row);
      winner.load+=finiteWeight(row);
      winner.remaining--;
    }

    return bins;
  }

  function positions(grid,depth,seed){
    const out=[];

    for(let y=0;y<grid;y++){
      const reverse=(y+depth+(seed&1))%2===1;
      for(let step=0;step<grid;step++){
        out.push({x:reverse?grid-1-step:step,y});
      }
    }

    if(seed&2)out.reverse();
    if(seed&4){
      for(const point of out){
        const swap=point.x;
        point.x=point.y;
        point.y=swap;
      }
    }

    return out;
  }

  function binRank(bin){
    if(!bin.rows.length)return Infinity;
    return bin.rows.reduce((sum,row)=>sum+Number(row.__sortIndex||0),0)/bin.rows.length;
  }

  function buildNode(rows,a,b,x,y,side,depth,seed,leaves){
    if(rows.length===1||(!a&&!b)){
      const item=rows[0];
      const leaf={x,y,side,depth,item,children:null};
      leaves.push({...item,x,y,side,cx:x+side/2,cy:y+side/2,depth});
      return leaf;
    }

    let grid;
    if(a>0&&b>0){
      const density=rows.reduce((sum,row)=>sum+finiteWeight(row),0)/rows.length;
      grid=((depth+(seed&3)+Math.round(density))%5===0)?3:2;
    }else{
      grid=b>0?3:2;
    }

    if(grid===2&&a<=0)grid=3;
    if(grid===3&&b<=0)grid=2;

    const childCount=grid*grid;
    const remainingA=a-(grid===2?1:0);
    const remainingB=b-(grid===3?1:0);
    const bundles=distributeBundles(childCount,remainingA,remainingB,rows);
    const bins=assignRows(rows,bundles).sort((left,right)=>
      binRank(left)-binRank(right)||left.index-right.index
    );
    const cells=positions(grid,depth,seed);
    const childSide=side/grid;
    const children=[];

    bins.forEach((bin,index)=>{
      const point=cells[index];
      children.push(buildNode(
        bin.rows,
        bin.a,
        bin.b,
        x+point.x*childSide,
        y+point.y*childSide,
        childSide,
        depth+1,
        (seed*1664525+1013904223+index)>>>0,
        leaves
      ));
    });

    return {x,y,side,depth,item:null,children,grid};
  }

  function hit(node,nx,ny){
    if(!node||nx<node.x||ny<node.y||nx>node.x+node.side||ny>node.y+node.side){
      return null;
    }

    let current=node;

    while(current?.children?.length){
      let next=null;
      for(const child of current.children){
        if(
          nx>=child.x-EPS&&nx<=child.x+child.side+EPS&&
          ny>=child.y-EPS&&ny<=child.y+child.side+EPS
        ){
          next=child;
          break;
        }
      }
      if(!next)break;
      current=next;
    }

    return current?.item||null;
  }

  function pack(items,{seed=0}={}){
    const source=(Array.isArray(items)?items:[]).filter(Boolean);

    if(!source.length){
      return {root:null,leaves:[],sourceCount:0,leafCount:0,fragmentCount:0,maxDepth:0,coverage:0};
    }

    const required=nextConstructible(source.length);
    const prepared=source.slice();
    const fragments=required-source.length;
    const fragmentSource=source.slice().sort((a,b)=>finiteWeight(a)-finiteWeight(b));

    for(let index=0;index<fragments;index++){
      const original=fragmentSource[index%fragmentSource.length];
      prepared.push({
        ...original,
        __atlasWeight:Math.max(EPS,finiteWeight(original)/(fragments+1)),
        __fragment:true,
        __fragmentIndex:index+1
      });
    }

    const plan=representation(required);
    const leaves=[];
    const root=buildNode(prepared,plan.a,plan.b,0,0,1,0,Number(seed)>>>0,leaves);
    const coverage=leaves.reduce((sum,leaf)=>sum+leaf.side*leaf.side,0);
    const maxDepth=leaves.reduce((value,leaf)=>Math.max(value,leaf.depth||0),0);

    return {
      root,
      leaves,
      sourceCount:source.length,
      leafCount:leaves.length,
      fragmentCount:fragments,
      maxDepth,
      coverage:clamp(coverage,0,1+EPS)
    };
  }

  W.ZZXMempoolTilesPacker=Object.freeze({
    __version:5,
    representation,
    isConstructible,
    nextConstructible,
    pack,
    hit
  });
})();
