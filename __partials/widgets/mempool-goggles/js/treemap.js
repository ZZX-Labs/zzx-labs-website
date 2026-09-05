// __partials/widgets/mempool-goggles/js/treemap.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolGogglesTreemap?.__version>=1)return;

  function sum(items,start,end){
    let total=0;
    for(let i=start;i<end;i++){
      total+=Math.max(0,Number(items[i]?.weight)||0);
    }
    return total;
  }

  function splitIndex(items,start,end,total){
    if(end-start<=1)return start+1;

    const half=total/2;
    let acc=0;
    let best=start+1;
    let bestDelta=Infinity;

    for(let i=start;i<end-1;i++){
      acc+=Math.max(0,Number(items[i]?.weight)||0);
      const delta=Math.abs(half-acc);

      if(delta<bestDelta){
        bestDelta=delta;
        best=i+1;
      }
    }

    return best;
  }

  function layout(items,width,height){
    const rows=(Array.isArray(items)?items:[])
      .filter(item=>(Number(item?.weight)||0)>0)
      .sort((a,b)=>(Number(b.weight)||0)-(Number(a.weight)||0));

    const rects=[];

    function place(start,end,x,y,w,h){
      if(start>=end||w<=0||h<=0)return;

      if(end-start===1){
        rects.push({
          item:rows[start],
          x,y,w,h
        });
        return;
      }

      const total=sum(rows,start,end);
      if(!(total>0))return;

      const cut=splitIndex(rows,start,end,total);
      const leftWeight=sum(rows,start,cut);
      const fraction=Math.max(.02,Math.min(.98,leftWeight/total));

      if(w>=h){
        const w1=w*fraction;
        place(start,cut,x,y,w1,h);
        place(cut,end,x+w1,y,w-w1,h);
      }else{
        const h1=h*fraction;
        place(start,cut,x,y,w,h1);
        place(cut,end,x,y+h1,w,h-h1);
      }
    }

    place(0,rows.length,0,0,width,height);
    return rects;
  }

  W.ZZXMempoolGogglesTreemap=Object.freeze({
    __version:1,
    layout
  });
})();
