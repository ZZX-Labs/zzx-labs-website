// __partials/widgets/mempool-specs/js/plotter.js
// v5 — compatibility canvas plotter for square/rect packed layouts
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Plotter?.__version>=5)return;

  function span(cells,cell,gap){
    const c=Math.max(1,Math.floor(cells||1));
    return c*cell+Math.max(0,c-1)*gap;
  }

  function draw(ctx,canvas,grid,layout,meta){
    if(!ctx||!canvas||!grid)return;

    const theme=NS.Theme?.get?.()||{};
    const colors=theme.colors||theme;
    const colorForFee=NS.Theme?.colorForFeeRate||(()=>"#555");

    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=colors.canvasBg||"#000";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const placed=Array.isArray(layout?.placed)?layout.placed:[];
    for(const tx of placed){
      const cx=Math.max(0,Math.floor(Number(tx.x)||0));
      const cy=Math.max(0,Math.floor(Number(tx.y)||0));
      const wc=Math.max(1,Math.floor(Number(tx.w??tx.side)||1));
      const hc=Math.max(1,Math.floor(Number(tx.h??tx.side)||1));
      const x=grid.x0+cx*grid.step;
      const y=grid.y0+cy*grid.step;
      const w=span(wc,grid.cellPx,grid.gapPx);
      const h=span(hc,grid.cellPx,grid.gapPx);

      ctx.globalAlpha=tx.detailed===false?.55:1;
      ctx.fillStyle=tx.detailed===false
        ? colors.pending||"#171b1d"
        : colorForFee(Number(tx.packageFeeRate??tx.feeRate)||0,theme);

      ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=colors.tileOutline||"rgba(255,255,255,.08)";
      ctx.lineWidth=1;
      ctx.strokeRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,h-1));
    }
    ctx.globalAlpha=1;

    if(meta){
      ctx.fillStyle=colors.text||"#c0d674";
      ctx.font=`${Math.max(11,Math.round(10*(grid.dpr||1)))}px "IBM Plex Mono", monospace`;
      ctx.fillText(String(meta),Math.round(10*(grid.dpr||1)),canvas.height-Math.round(12*(grid.dpr||1)));
    }

    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=Math.max(2,Math.round(2*(grid.dpr||1)));
    ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
    ctx.restore();
  }

  NS.Plotter=Object.freeze({
    __version:5,
    draw
  });
})();
