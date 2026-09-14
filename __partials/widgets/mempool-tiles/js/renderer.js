// mempool-tiles/js/renderer.js
// v4 — full-cover square renderer. No gutters, no rectangular TX glyphs.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesRenderer?.__version>=4)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function canvasSize(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(260,Math.floor(Math.min(rect.width||720,rect.height||rect.width||720)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);
    if(canvas.width!==px||canvas.height!==px){
      canvas.width=px;
      canvas.height=px;
    }
    return {css,dpr};
  }

  function rgb(hex){
    const value=String(hex||"").replace("#","");
    return /^[0-9a-f]{6}$/i.test(value)
      ? [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)]
      : [80,80,80];
  }

  function mix(a,b,t){
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
  }

  function feeColor(rate,colors){
    const anchors=[
      [0.000,colors.feeFloor||"#152229"],
      [0.500,colors.feeLow||"#20353d"],
      [1.000,colors.feeLow2||"#31544d"],
      [2.000,colors.feeMidLow||"#52755a"],
      [5.000,colors.feeMid||"#79945f"],
      [10.00,colors.feeMidHigh||"#9cad67"],
      [25.00,colors.feeHigh||"#c0d674"],
      [50.00,colors.feeVeryHigh||"#d0c265"],
      [100.0,colors.boosted||"#e6a42b"]
    ];

    const value=Number(rate);
    if(!Number.isFinite(value))return colors.pending||"#263137";
    if(value<=anchors[0][0])return anchors[0][1];
    if(value>=anchors.at(-1)[0])return anchors.at(-1)[1];

    for(let i=1;i<anchors.length;i++){
      if(value>anchors[i][0])continue;
      const [av,ac]=anchors[i-1];
      const [bv,bc]=anchors[i];
      const t=clamp((Math.log1p(Math.max(0,value))-Math.log1p(av))/Math.max(1e-9,Math.log1p(bv)-Math.log1p(av)),0,1);
      return mix(rgb(ac),rgb(bc),t);
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

  function color(tile,mode,colors){
    return mode==="type"?typeColor(tile,colors):feeColor(tile.packageFeeRate??tile.feeRate,colors);
  }

  function geometry(tile){
    return {
      x:Number(tile?.x)||0,
      y:Number(tile?.y)||0,
      side:Number(tile?.side)||0,
      cx:Number(tile?.cx)||((Number(tile?.x)||0)+(Number(tile?.side)||0)/2),
      cy:Number(tile?.cy)||((Number(tile?.y)||0)+(Number(tile?.side)||0)/2)
    };
  }

  function pixelRect(tile,css){
    const x0=Math.round(tile.x*css);
    const y0=Math.round(tile.y*css);
    const x1=Math.round((tile.x+tile.side)*css);
    const y1=Math.round((tile.y+tile.side)*css);
    return {x:x0,y:y0,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0)};
  }

  function draw(canvas,layout,{selectedTxid="",hoverTxid="",colorMode="fee"}={}){
    if(!canvas||!layout)return;
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)return;

    const {css,dpr}=canvasSize(canvas);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const theme=W.ZZXMempoolTilesThemes.get();
    const colors=theme.colors||{};
    ctx.fillStyle=colors.background||"#020302";
    ctx.fillRect(0,0,css,css);

    // Exact-cover layouts intentionally draw edge-to-edge. Pixel boundaries
    // are rounded from shared normalized coordinates so adjacent squares meet.
    for(const tile of layout.tiles){
      const r=pixelRect(tile,css);
      ctx.fillStyle=color(tile,colorMode,colors);
      ctx.fillRect(r.x,r.y,r.w,r.h);

      if(r.w>=4&&r.h>=4){
        ctx.strokeStyle=colors.grid||"rgba(255,255,255,.085)";
        ctx.lineWidth=1;
        ctx.strokeRect(r.x+.5,r.y+.5,Math.max(.1,r.w-1),Math.max(.1,r.h-1));
      }

      if(r.w>=48&&r.h>=48){
        const rate=Number(tile.packageFeeRate??tile.feeRate);
        ctx.fillStyle=colors.textOnTile||"rgba(0,0,0,.78)";
        ctx.font='9px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textBaseline="top";
        ctx.fillText(Number.isFinite(rate)?`${rate.toFixed(rate<1?3:1)} sat/vB`:"fee pending",r.x+4,r.y+3,Math.max(10,r.w-8));
      }
    }

    for(const [txid,width,stroke] of [
      [selectedTxid,2,colors.selected||"#fff"],
      [hoverTxid,1.25,colors.border||"#e6a42b"]
    ]){
      if(!txid)continue;
      const tile=layout.byTxid.get(txid);
      if(!tile)continue;
      const r=pixelRect(tile,css);
      ctx.save();
      ctx.strokeStyle=stroke;
      ctx.lineWidth=width;
      ctx.shadowColor=stroke;
      ctx.shadowBlur=width>1?7:3;
      ctx.strokeRect(r.x+width/2,r.y+width/2,Math.max(1,r.w-width),Math.max(1,r.h-width));
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.globalAlpha=.72;
    ctx.lineWidth=1;
    ctx.strokeRect(.5,.5,css-1,css-1);
    ctx.restore();
  }

  W.ZZXMempoolTilesRenderer=Object.freeze({
    __version:4,
    feeColor,
    typeColor,
    color,
    geometry,
    draw
  });
})();
