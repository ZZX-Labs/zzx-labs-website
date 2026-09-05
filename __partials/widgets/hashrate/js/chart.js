// __partials/widgets/hashrate/js/chart.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateChart?.__version>=2)return;

  function draw(canvas,values){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||300));
    const height=Math.max(1,Math.floor(rect.height||100));
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const src=(Array.isArray(values)?values:[]).filter(Number.isFinite);
    if(src.length<2)return;

    const pad=8;
    const min=Math.min(...src);
    const max=Math.max(...src);
    const span=max-min||1;

    const points=src.map((value,index)=>({
      x:pad+(index/Math.max(1,src.length-1))*(width-pad*2),
      y:(height-pad)-((value-min)/span)*(height-pad*2)
    }));

    ctx.lineWidth=1;
    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.beginPath();
    for(let i=1;i<4;i++){
      const y=pad+(i/4)*(height-pad*2);
      ctx.moveTo(pad,y);
      ctx.lineTo(width-pad,y);
    }
    ctx.stroke();

    ctx.lineWidth=2;
    ctx.strokeStyle="rgba(192,214,116,.95)";
    ctx.beginPath();
    points.forEach((p,index)=>{
      if(index===0)ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    });
    ctx.stroke();

    ctx.fillStyle="rgba(192,214,116,.10)";
    ctx.beginPath();
    ctx.moveTo(points[0].x,height-pad);
    points.forEach((p,index)=>{
      if(index===0)ctx.lineTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    });
    ctx.lineTo(points[points.length-1].x,height-pad);
    ctx.closePath();
    ctx.fill();
  }

  W.ZZXHashrateChart=Object.freeze({
    __version:2,
    draw
  });
})();
