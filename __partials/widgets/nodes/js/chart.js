(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesChart?.__version>=4)return;

  function draw(canvas,history){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||320));
    const height=Math.max(1,Math.floor(rect.height||104));
    const dpr=Math.max(1,Math.min(3,Number(W.devicePixelRatio)||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const rows=(Array.isArray(history)?history:[])
      .map(row=>({
        t:Number(row?.t),
        v:Number(row?.total)
      }))
      .filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.v));

    if(rows.length<2){
      ctx.fillStyle="#777";
      ctx.font='10px "IBM Plex Mono",monospace';
      ctx.fillText("history accumulating…",8,18);
      return;
    }

    const values=rows.map(row=>row.v);
    const min=Math.min(...values);
    const max=Math.max(...values);
    const span=max-min||1;
    const pad=8;

    const points=rows.map((row,index)=>({
      x:pad+(index/Math.max(1,rows.length-1))*(width-pad*2),
      y:(height-pad)-((row.v-min)/span)*(height-pad*2)
    }));

    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.lineWidth=1;

    for(let i=1;i<4;i++){
      const y=pad+(i/4)*(height-pad*2);
      ctx.beginPath();
      ctx.moveTo(pad,y);
      ctx.lineTo(width-pad,y);
      ctx.stroke();
    }

    ctx.fillStyle="rgba(192,214,116,.10)";
    ctx.beginPath();
    ctx.moveTo(points[0].x,height-pad);
    points.forEach(point=>ctx.lineTo(point.x,point.y));
    ctx.lineTo(points.at(-1).x,height-pad);
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

    ctx.fillStyle="#777";
    ctx.font='9px "IBM Plex Mono",monospace';
    ctx.fillText(
      `${Math.round(min).toLocaleString()}–${Math.round(max).toLocaleString()}`,
      8,
      height-4
    );
  }

  W.ZZXNodesChart=Object.freeze({
    __version:4,
    draw
  });
})();
