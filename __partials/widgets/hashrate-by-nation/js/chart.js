// __partials/widgets/hashrate-by-nation/js/chart.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateNationChart?.__version>=3)return;

  function draw(canvas,rows){
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||300));
    const height=Math.max(1,Math.floor(rect.height||190));
    const dpr=Math.max(1,Math.min(3,devicePixelRatio||1));

    canvas.width=Math.floor(width*dpr);
    canvas.height=Math.floor(height*dpr);

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const data=(Array.isArray(rows)?rows:[]).slice(0,10);
    if(!data.length)return;

    const padL=42,padR=54,padT=8,padB=8;
    const innerW=Math.max(1,width-padL-padR);
    const rowH=(height-padT-padB)/data.length;
    const max=Math.max(...data.map(row=>Number(row.estimatedEH)||0),1);

    ctx.font='10px "IBM Plex Mono", monospace';
    ctx.textBaseline="middle";

    data.forEach((row,index)=>{
      const y=padT+index*rowH;
      const center=y+rowH/2;
      const barH=Math.max(4,rowH*.55);
      const w=innerW*((Number(row.estimatedEH)||0)/max);

      ctx.fillStyle="rgba(255,255,255,.06)";
      ctx.fillRect(padL,center-barH/2,innerW,barH);

      ctx.fillStyle="rgba(192,214,116,.82)";
      ctx.fillRect(padL,center-barH/2,w,barH);

      ctx.fillStyle="#b7bf9a";
      ctx.textAlign="left";
      ctx.fillText(String(row.iso||"—").slice(0,6),4,center);

      ctx.textAlign="right";
      ctx.fillText(`${Number(row.estimatedEH).toFixed(1)} EH/s`,width-4,center);
    });
  }

  W.ZZXHashrateNationChart=Object.freeze({
    __version:3,
    draw
  });
})();
