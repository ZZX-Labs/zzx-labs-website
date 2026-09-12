// __partials/widgets/mempool-specs/js/tetrifill.js
// v5 — deterministic square tetris-style packer
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TetriFill?.__version>=5)return;

  function makeOcc(rows,cols){
    return Array.from({length:rows},()=>new Uint8Array(cols));
  }

  function canPlace(occ,cols,rows,x,y,side){
    if(x<0||y<0||x+side>cols||y+side>rows)return false;
    for(let yy=y;yy<y+side;yy++)for(let xx=x;xx<x+side;xx++)if(occ[yy][xx])return false;
    return true;
  }

  function mark(occ,x,y,side,value=1){
    for(let yy=y;yy<y+side;yy++)for(let xx=x;xx<x+side;xx++)occ[yy][xx]=value;
  }

  function bestSpot(occ,cols,rows,side,scan){
    let best=null;
    const visit=(x,y)=>{
      if(!canPlace(occ,cols,rows,x,y,side))return;
      const score=((rows-y)*100000)+((cols-x)*100)+(side*2);
      if(!best||score>best.score)best={x,y,score};
    };

    if(scan==="col"){
      for(let x=0;x<=cols-side;x++)for(let y=0;y<=rows-side;y++)visit(x,y);
    }else{
      for(let y=0;y<=rows-side;y++)for(let x=0;x<=cols-side;x++)visit(x,y);
    }
    return best&&{x:best.x,y:best.y};
  }

  function compact(placed,cols,rows,passes){
    for(let pass=0;pass<passes;pass++){
      const occ=makeOcc(rows,cols);
      for(const p of placed)mark(occ,p.x,p.y,p.side,1);
      let moved=0;

      for(const p of placed.slice().sort((a,b)=>b.side-a.side)){
        mark(occ,p.x,p.y,p.side,0);
        let found=null;
        for(let y=0;y<=p.y&&!found;y++){
          for(let x=0;x<=p.x;x++){
            if(canPlace(occ,cols,rows,x,y,p.side)){found={x,y};break}
          }
        }
        found=found||{x:p.x,y:p.y};
        mark(occ,found.x,found.y,p.side,1);
        if(found.x!==p.x||found.y!==p.y){p.x=found.x;p.y=found.y;moved++}
      }
      if(!moved)break;
    }
  }

  function pack(items,grid,opts={}){
    const cols=Math.max(1,Math.floor(grid?.cols||1));
    const rows=Math.max(1,Math.floor(grid?.rows||1));
    const scan=opts.scan==="col"?"col":"row";
    const passes=Number.isFinite(opts.bubblePasses)?Math.max(0,Math.floor(opts.bubblePasses)):1;

    const sorter=NS.Sorter?.stablePriority;
    const arr=sorter
      ? sorter(items,Number(opts.seed)||0)
      : (Array.isArray(items)?items.slice():[]);

    arr.sort((a,b)=>(Number(b.side)||1)-(Number(a.side)||1) || (Number(b.feeRate)||0)-(Number(a.feeRate)||0));

    const occ=makeOcc(rows,cols);
    const placed=[],rejected=[];

    for(const item of arr){
      const side=Math.max(1,Math.floor(Number(item.side)||1));
      if(side>cols||side>rows){rejected.push(item);continue}
      const spot=bestSpot(occ,cols,rows,side,scan);
      if(!spot){rejected.push(item);continue}
      mark(occ,spot.x,spot.y,side,1);
      placed.push({...item,x:spot.x,y:spot.y,side});
    }

    compact(placed,cols,rows,passes);
    return {placed,rejected,cols,rows};
  }

  NS.TetriFill=Object.freeze({
    __version:5,
    pack
  });
})();
