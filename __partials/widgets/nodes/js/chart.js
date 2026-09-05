// __partials/widgets/nodes/js/chart.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesChart?.__version>=3)return;

  function draw(canvas,history){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||300));
    const height=Math.max(1,Math.floor(rect.height||92));
    const dpr=Math.max(1,Math.min(3,devicePixelRatio||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const rows=(Array.isArray(history)?history:[])
      .map(row=>({
        t:Number(row[0]),
        v:Number(row[1])
      }))
      .filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.v));

    if(rows.length<2)return;

    const values=rows.map(row=>row.v);
    const min=Math.min(...values);
    const max=Math.max(...values);
    const span=max-min||1;
    const pad=7;

    const points=rows.map((row,index)=>({
      x:pad+(index/Math.max(1,rows.length-1))*(width-pad*2),
      y:(height-pad)-((row.v-min)/span)*(height-pad*2)
    }));

    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.lineWidth=1;
    ctx.beginPath();

    for(let i=1;i<4;i++){
      const y=pad+(i/4)*(height-pad*2);
      ctx.moveTo(pad,y);
      ctx.lineTo(width-pad,y);
    }

    ctx.stroke();

    ctx.fillStyle="rgba(192,214,116,.10)";
    ctx.beginPath();
    ctx.moveTo(points[0].x,height-pad);
    points.forEach((point,index)=>{
      if(index===0)ctx.lineTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.lineTo(points[points.length-1].x,height-pad);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle="rgba(192,214,116,.95)";
    ctx.lineWidth=2;
    ctx.beginPath();

    points.forEach((point,index)=>{
      if(index===0)ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });

    ctx.stroke();
  }

  W.ZZXNodesChart=Object.freeze({
    __version:3,
    draw
  });
})();
