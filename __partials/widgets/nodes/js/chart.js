// __partials/widgets/nodes/js/chart.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesChart?.__version||0)>=5)return;

  function normalize(history){
    return (Array.isArray(history)?history:[])
      .map(row=>({
        t:Number(row?.t ?? row?.[0]),
        v:Number(row?.total ?? row?.v ?? row?.[1])
      }))
      .filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.v)&&row.v>=0)
      .sort((a,b)=>a.t-b.t);
  }

  function draw(canvas,history){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||320));
    const height=Math.max(1,Math.floor(rect.height||112));
    const dpr=Math.max(1,Math.min(3,Number(W.devicePixelRatio)||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const rows=normalize(history);

    if(rows.length<2){
      ctx.fillStyle="#777";
      ctx.font='10px "IBM Plex Mono",monospace';
      ctx.fillText("history accumulating…",8,18);
      return;
    }

    const values=rows.map(row=>row.v);
    const min=Math.min(...values);
    const max=Math.max(...values);
    const span=Math.max(1,max-min);
    const padX=8;
    const padTop=8;
    const padBottom=14;
    const plotH=Math.max(1,height-padTop-padBottom);

    const tMin=rows[0].t;
    const tMax=rows[rows.length-1].t;
    const tSpan=Math.max(1,tMax-tMin);

    const points=rows.map(row=>({
      x:padX+((row.t-tMin)/tSpan)*(width-padX*2),
      y:padTop+(1-((row.v-min)/span))*plotH
    }));

    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.lineWidth=1;
    for(let i=1;i<4;i++){
      const y=padTop+(i/4)*plotH;
      ctx.beginPath();
      ctx.moveTo(padX,y);
      ctx.lineTo(width-padX,y);
      ctx.stroke();
    }

    ctx.fillStyle="rgba(192,214,116,.10)";
    ctx.beginPath();
    ctx.moveTo(points[0].x,height-padBottom);
    for(const point of points)ctx.lineTo(point.x,point.y);
    ctx.lineTo(points[points.length-1].x,height-padBottom);
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

    const first=rows[0].v;
    const last=rows[rows.length-1].v;
    const delta=last-first;
    const deltaText=`${delta>=0?"+":""}${Math.round(delta).toLocaleString()}`;

    ctx.fillStyle="#777";
    ctx.font='9px "IBM Plex Mono",monospace';
    ctx.fillText(
      `${Math.round(min).toLocaleString()}–${Math.round(max).toLocaleString()} · Δ ${deltaText}`,
      8,
      height-4
    );
  }

  W.ZZXNodesChart=Object.freeze({
    __version:5,
    normalize,
    draw
  });
})();
