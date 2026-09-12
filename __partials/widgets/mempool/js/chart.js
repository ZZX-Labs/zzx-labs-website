// __partials/widgets/mempool/js/chart.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolChart?.__version>=4)return;

  const BUCKETS=[
    {label:"<1",min:0,max:1},
    {label:"1–2",min:1,max:2},
    {label:"2–5",min:2,max:5},
    {label:"5–10",min:5,max:10},
    {label:"10–25",min:10,max:25},
    {label:"25–50",min:25,max:50},
    {label:"50+",min:50,max:Infinity}
  ];

  function aggregate(hist){
    return BUCKETS.map(bucket=>{
      const vbytes=(hist||[])
        .filter(row=>row.rate>=bucket.min&&row.rate<bucket.max)
        .reduce((s,row)=>s+row.vbytes,0);

      return {
        ...bucket,
        vbytes,
        vMB:vbytes/1e6
      };
    });
  }

  function draw(canvas,hist){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||300));
    const height=Math.max(1,Math.floor(rect.height||132));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const rows=aggregate(hist);
    const max=Math.max(...rows.map(row=>row.vMB),1e-9);

    const padL=8,padR=8,padT=18,padB=24;
    const innerW=Math.max(1,width-padL-padR);
    const innerH=Math.max(1,height-padT-padB);
    const gap=5;
    const barW=Math.max(3,(innerW-gap*(rows.length-1))/rows.length);

    ctx.font='9px "IBM Plex Mono", monospace';
    ctx.textAlign="center";

    rows.forEach((row,index)=>{
      const x=padL+index*(barW+gap);
      const h=(row.vMB/max)*innerH;
      const y=padT+innerH-h;

      ctx.fillStyle="rgba(192,214,116,.82)";
      ctx.fillRect(x,y,barW,h);

      if(row.vMB>0){
        ctx.fillStyle="#b7bf9a";
        ctx.textBaseline="bottom";
        ctx.fillText(
          row.vMB>=10?row.vMB.toFixed(0):row.vMB.toFixed(1),
          x+barW/2,
          Math.max(10,y-2)
        );
      }

      ctx.fillStyle="#777";
      ctx.textBaseline="top";
      ctx.fillText(
        row.label,
        x+barW/2,
        height-padB+6
      );
    });
  }

  W.ZZXMempoolChart=Object.freeze({
    __version:4,
    BUCKETS,
    aggregate,
    draw
  });
})();
