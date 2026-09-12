// __partials/widgets/mempool-specs/js/renderer.js
(function(){
  "use strict";
  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Renderer?.__version>=4)return;

  function size(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(220,Math.floor(Math.min(rect.width||520,rect.height||rect.width||520)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);
    if(canvas.width!==px||canvas.height!==px){canvas.width=px;canvas.height=px}
    return {css,dpr};
  }

  function previousMap(layout){
    if(!layout?.tiles)return null;
    const m=new Map();
    for(const t of layout.tiles)m.set(t.txid,t);
    return m;
  }

  function position(tile,layout,fromMap,fromLayout,t){
    const nx=tile.x/layout.gridN,ny=tile.y/layout.gridN,ns=tile.side/layout.gridN;
    if(!(fromMap&&fromLayout&&t<1))return {x:nx,y:ny,s:ns,alpha:1};
    const old=fromMap.get(tile.txid);
    if(!old)return {x:nx,y:ny,s:ns,alpha:t};
    const ox=old.x/fromLayout.gridN,oy=old.y/fromLayout.gridN,os=old.side/fromLayout.gridN;
    return {
      x:ox+(nx-ox)*t,
      y:oy+(ny-oy)*t,
      s:os+(ns-os)*t,
      alpha:1
    };
  }

  function draw(canvas,layout,opts={}){
    if(!canvas||!layout)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const {css,dpr}=size(canvas);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);

    const theme=NS.Theme?.get?.()||{};
    const colors=theme.colors||{};
    ctx.fillStyle=colors.canvasBg||"#000";ctx.fillRect(0,0,css,css);

    const pad=8;
    const inner=css-pad*2;
    ctx.strokeStyle=colors.gridLine||"rgba(255,255,255,.045)";
    ctx.lineWidth=1;
    const stripe=Math.max(32,Math.floor(inner/10));
    for(let p=pad+stripe;p<css-pad;p+=stripe){
      ctx.beginPath();ctx.moveTo(p+.5,pad);ctx.lineTo(p+.5,css-pad);ctx.stroke();
      ctx.beginPath();ctx.moveTo(pad,p+.5);ctx.lineTo(css-pad,p+.5);ctx.stroke();
    }

    const fromLayout=opts.fromLayout||null;
    const fromMap=opts.fromMap||previousMap(fromLayout);
    const progress=Number.isFinite(opts.progress)?opts.progress:1;
    const colorForFee=NS.Theme?.colorForFeeRate||(()=>"#555");

    for(const tile of layout.tiles){
      const p=position(tile,layout,fromMap,fromLayout,progress);
      const x=pad+p.x*inner,y=pad+p.y*inner,s=Math.max(.55,p.s*inner);
      ctx.globalAlpha=p.alpha*(tile.detailed?1:.52);
      ctx.fillStyle=tile.detailed?colorForFee(tile.packageFeeRate??tile.feeRate,theme):(colors.pending||"#171b1d");
      ctx.fillRect(x,y,s,s);
      if(s>=2.4){
        ctx.strokeStyle=colors.tileOutline||"rgba(255,255,255,.09)";
        ctx.lineWidth=.6;
        ctx.strokeRect(x+.3,y+.3,Math.max(.1,s-.6),Math.max(.1,s-.6));
      }
    }
    ctx.globalAlpha=1;

    // Projected one-vMB block boundaries follow the actual sorted transaction stream.
    ctx.save();
    ctx.setLineDash([4,4]);
    ctx.strokeStyle=colors.marker||"rgba(230,164,43,.82)";
    ctx.fillStyle=colors.marker||"rgba(230,164,43,.82)";
    ctx.font='9px "IBM Plex Mono", monospace';
    ctx.textAlign="right";
    for(const marker of layout.markers.slice(0,12)){
      const y=pad+(marker.y/layout.gridN)*inner;
      if(y<=pad+2||y>=css-pad-2)continue;
      ctx.beginPath();ctx.moveTo(pad,y+.5);ctx.lineTo(css-pad,y+.5);ctx.stroke();
      ctx.fillText(`+${marker.block}`,css-pad-3,Math.max(pad+2,y-10));
    }
    ctx.restore();

    const selected=opts.selectedTxid?layout.byTxid.get(opts.selectedTxid):null;
    const hovered=opts.hoverTxid?layout.byTxid.get(opts.hoverTxid):null;
    for(const [tile,width,color] of [[selected,2,colors.selected||"#fff"],[hovered,1,colors.border||"#e6a42b"]]){
      if(!tile)continue;
      const x=pad+(tile.x/layout.gridN)*inner,y=pad+(tile.y/layout.gridN)*inner,s=Math.max(1,(tile.side/layout.gridN)*inner);
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.strokeRect(x+.5,y+.5,Math.max(1,s-1),Math.max(1,s-1));
    }

    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=2;
    ctx.strokeRect(1,1,css-2,css-2);
  }

  NS.Renderer=Object.freeze({__version:4,draw,previousMap});
})();
