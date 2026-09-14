// mempool-mosaic/js/renderer.js
// v6 — full-cover square mosaic renderer; fee hue + vB luminance modulation.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicRenderer?.__version>=6)return;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function canvasSize(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(260,Math.floor(Math.min(rect.width||720,rect.height||rect.width||720)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);
    if(canvas.width!==px||canvas.height!==px){canvas.width=px;canvas.height=px;}
    return {css,dpr};
  }

  function rgb(value){
    const raw=String(value||"").trim();
    const v=raw.replace("#","");
    if(/^[0-9a-f]{6}$/i.test(v))return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)];
    const match=raw.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i);
    return match?[Number(match[1]),Number(match[2]),Number(match[3])]:[80,80,80];
  }
  function mixRgb(a,b,t){return [Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];}
  function cssRgb(v){return `rgb(${v[0]},${v[1]},${v[2]})`;}

  function feeColor(rate,colors){
    const anchors=[
      [0,colors.feeFloor||"#152229"],[.5,colors.feeLow||"#20353d"],[1,colors.feeLow2||"#31544d"],
      [2,colors.feeMidLow||"#52755a"],[5,colors.feeMid||"#79945f"],[10,colors.feeMidHigh||"#9cad67"],
      [25,colors.feeHigh||"#c0d674"],[50,colors.feeVeryHigh||"#d0c265"],[100,colors.boosted||"#e6a42b"]
    ];
    const value=Number(rate);
    if(!Number.isFinite(value))return colors.pending||"#263137";
    if(value<=0)return anchors[0][1];
    if(value>=anchors.at(-1)[0])return anchors.at(-1)[1];
    for(let i=1;i<anchors.length;i++){
      if(value>anchors[i][0])continue;
      const [av,ac]=anchors[i-1],[bv,bc]=anchors[i];
      const t=clamp((Math.log1p(value)-Math.log1p(av))/Math.max(1e-9,Math.log1p(bv)-Math.log1p(av)),0,1);
      return cssRgb(mixRgb(rgb(ac),rgb(bc),t));
    }
    return anchors.at(-1)[1];
  }

  function typeColor(tile,colors){
    if(tile.boosted)return colors.boosted||"#e6a42b";
    if(tile.ordinal)return colors.ordinal||"#7657a8";
    const type=String(tile.type||"").toLowerCase();
    if(type.includes("op_return")||type.includes("data"))return colors.data||"#6e7480";
    if(tile.rbf===true)return colors.rbf||"#d65a5a";
    if(tile.rbf===false)return colors.nonRbf||"#4e83d6";
    return colors.unknown||"#56605d";
  }

  function feeVbColor(tile,colors){
    const base=rgb(feeColor(tile.packageFeeRate??tile.feeRate,colors));
    const background=rgb(colors.background||"#020302");
    const hot=rgb(colors.feeVeryHigh||colors.border||"#e6a42b");
    const v=clamp(Number(tile.vsizeNorm)||0,0,1);
    // Small-vB transactions retain the fee hue but sit closer to the background;
    // large-vB transactions become brighter/denser. Thus fee and vB jointly
    // determine color while BTC amount remains free to determine square area.
    const dense=mixRgb(background,base,.58+.34*v);
    return cssRgb(mixRgb(dense,hot,.08*v));
  }

  function color(tile,mode,colors){
    if(mode==="type")return typeColor(tile,colors);
    if(mode==="fee")return feeColor(tile.packageFeeRate??tile.feeRate,colors);
    return feeVbColor(tile,colors);
  }

  function pixelRect(tile,css){
    const side=Math.max(0,Number(tile?.side)||0)*css;
    return {x:(Number(tile?.x)||0)*css,y:(Number(tile?.y)||0)*css,w:side,h:side};
  }

  function drawGuides(ctx,layout,css,colors){
    if(!Array.isArray(layout?.guides))return;
    ctx.save();
    for(const guide of layout.guides){
      if((guide.depth||0)===0)continue;
      const r=pixelRect(guide,css);
      ctx.strokeStyle=colors.border||"#e6a42b";
      ctx.globalAlpha=guide.depth===1?.22:.11;
      ctx.lineWidth=guide.depth===1?1.15:.75;
      ctx.strokeRect(r.x+.5,r.y+.5,Math.max(.1,r.w-1),Math.max(.1,r.h-1));
    }
    ctx.restore();
  }

  function draw(canvas,layout,{selectedTxid="",hoverTxid="",colorMode="fee-vb"}={}){
    if(!canvas||!layout)return;
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)return;
    const {css,dpr}=canvasSize(canvas);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const colors=W.ZZXMempoolMosaicThemes.get().colors||{};
    ctx.fillStyle=colors.background||"#020302";
    ctx.fillRect(0,0,css,css);

    for(const tile of layout.tiles){
      const r=pixelRect(tile,css);
      ctx.fillStyle=color(tile,colorMode,colors);
      ctx.fillRect(r.x,r.y,r.w,r.h);
      if(r.w>=3.5){
        ctx.strokeStyle=colors.grid||"rgba(255,255,255,.09)";
        ctx.globalAlpha=.52;
        ctx.lineWidth=.7;
        ctx.strokeRect(r.x+.35,r.y+.35,Math.max(.1,r.w-.7),Math.max(.1,r.h-.7));
        ctx.globalAlpha=1;
      }
      if(r.w>=54){
        const rate=Number(tile.packageFeeRate??tile.feeRate);
        const btc=Number(tile.valueSats);
        ctx.fillStyle=colors.textOnTile||"rgba(0,0,0,.78)";
        ctx.font='8px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textBaseline="top";
        if(Number.isFinite(btc))ctx.fillText(`${(btc/1e8).toFixed(btc>=1e8?3:5)} BTC`,r.x+4,r.y+3,Math.max(10,r.w-8));
        if(Number.isFinite(rate)&&r.w>=68)ctx.fillText(`${rate.toFixed(rate<1?3:1)} sat/vB`,r.x+4,r.y+13,Math.max(10,r.w-8));
      }
    }

    drawGuides(ctx,layout,css,colors);

    for(const [txid,width,stroke] of [[selectedTxid,2,colors.selected||"#fff"],[hoverTxid,1.2,colors.border||"#e6a42b"]]){
      if(!txid)continue;
      const matches=layout.tiles.filter(tile=>tile.txid===txid);
      if(!matches.length)continue;
      ctx.save();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.shadowColor=stroke;ctx.shadowBlur=width>1?7:3;
      for(const tile of matches){const r=pixelRect(tile,css);ctx.strokeRect(r.x+width/2,r.y+width/2,Math.max(1,r.w-width),Math.max(1,r.h-width));}
      ctx.restore();
    }

    ctx.save();ctx.strokeStyle=colors.border||"#e6a42b";ctx.globalAlpha=.72;ctx.lineWidth=1;ctx.strokeRect(.5,.5,css-1,css-1);ctx.restore();
  }

  W.ZZXMempoolMosaicRenderer=Object.freeze({__version:6,feeColor,typeColor,feeVbColor,color,draw});
})();
