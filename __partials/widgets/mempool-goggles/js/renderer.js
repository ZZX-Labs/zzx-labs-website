// __partials/widgets/mempool-goggles/js/renderer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolGogglesRenderer?.__version>=1)return;

  function color(rate,median,max){
    const r=Number(rate);
    const med=Number(median);
    const hi=Number(max);

    if(!Number.isFinite(r))return "#244052";
    if(Number.isFinite(hi)&&r>=Math.max(150,hi*.72))return "#e6a42b";
    if(Number.isFinite(med)&&r>=Math.max(20,med*1.35))return "#c0d674";
    if(Number.isFinite(med)&&r>=Math.max(5,med*.72))return "#4f8b67";
    return "#244052";
  }

  function resize(canvas){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||420));
    const height=Math.max(1,Math.floor(rect.height||420));
    const dpr=Math.max(1,Math.min(3,devicePixelRatio||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return null;

    ctx.setTransform(dpr,0,0,dpr,0,0);

    return {ctx,width,height,dpr};
  }

  function draw(canvas,tiles,stats){
    const surface=resize(canvas);
    if(!surface)return [];

    const {ctx,width,height}=surface;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle="#0a0a0a";
    ctx.fillRect(0,0,width,height);

    const pad=3;
    const rects=W.ZZXMempoolGogglesTreemap.layout(
      tiles,
      width-pad*2,
      height-pad*2
    );

    const hit=[];

    for(const rect of rects){
      const gap=Math.min(
        1.2,
        Math.max(.25,Math.min(rect.w,rect.h)*.06)
      );

      const x=pad+rect.x+gap;
      const y=pad+rect.y+gap;
      const w=Math.max(.4,rect.w-gap*2);
      const h=Math.max(.4,rect.h-gap*2);

      ctx.fillStyle=color(
        rect.item.feeRate,
        stats?.medianFee,
        stats?.feeMax
      );
      ctx.fillRect(x,y,w,h);

      if(w>12&&h>12){
        ctx.strokeStyle="rgba(255,255,255,.08)";
        ctx.lineWidth=.6;
        ctx.strokeRect(x+.3,y+.3,w-.6,h-.6);
      }

      hit.push({
        x,y,w,h,
        item:rect.item
      });
    }

    ctx.strokeStyle="rgba(230,164,43,.65)";
    ctx.lineWidth=1;
    ctx.strokeRect(.5,.5,width-1,height-1);

    return hit;
  }

  function hitTest(hits,x,y){
    for(let i=(hits||[]).length-1;i>=0;i--){
      const r=hits[i];

      if(
        x>=r.x && x<=r.x+r.w &&
        y>=r.y && y<=r.y+r.h
      ){
        return r;
      }
    }

    return null;
  }

  W.ZZXMempoolGogglesRenderer=Object.freeze({
    __version:1,
    color,
    draw,
    hitTest
  });
})();
