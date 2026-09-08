(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolGogglesTreemap?.__version>=2)return;

  function weight(item){return Math.max(0,Number(item?.weight??item?.vbytes)||0);}
  function sum(items,start,end){let total=0;for(let i=start;i<end;i++)total+=weight(items[i]);return total;}

  function splitIndex(items,start,end,total){
    if(end-start<=1)return start+1;
    const half=total/2;let acc=0;let best=start+1;let delta=Infinity;
    for(let i=start;i<end-1;i++){
      acc+=weight(items[i]);
      const d=Math.abs(half-acc);
      if(d<delta){delta=d;best=i+1;}
    }
    return best;
  }

  function layout(items,width,height){
    const rows=(Array.isArray(items)?items:[]).filter(item=>weight(item)>0);
    const rects=[];

    function place(start,end,x,y,w,h,depth){
      if(start>=end||w<=0||h<=0)return;
      if(end-start===1){rects.push({item:rows[start],x,y,w,h});return;}
      const total=sum(rows,start,end);if(!(total>0))return;
      const cut=splitIndex(rows,start,end,total);
      const first=sum(rows,start,cut);
      const fraction=Math.max(.015,Math.min(.985,first/total));
      const horizontal=(w>=h) !== (depth%3===2);
      if(horizontal){
        const w1=w*fraction;
        place(start,cut,x,y,w1,h,depth+1);
        place(cut,end,x+w1,y,w-w1,h,depth+1);
      }else{
        const h1=h*fraction;
        place(start,cut,x,y,w,h1,depth+1);
        place(cut,end,x,y+h1,w,h-h1,depth+1);
      }
    }

    place(0,rows.length,0,0,width,height,0);
    return rects;
  }

  W.ZZXMempoolGogglesTreemap=Object.freeze({__version:2,layout});
})();
