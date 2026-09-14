// v5 — full-coverage square atlas renderer with bivariate fee/vByte color.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesRenderer?.__version>=5)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function canvasSize(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(240,Math.floor(Math.min(rect.width||720,rect.height||rect.width||720)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);

    if(canvas.width!==px||canvas.height!==px){
      canvas.width=px;
      canvas.height=px;
    }

    return {css,dpr};
  }

  function rgb(value){
    const hex=String(value||"").replace("#","");
    return /^[0-9a-f]{6}$/i.test(hex)
      ? [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]
      : [80,80,80];
  }

  function mix(a,b,t){
    const A=Array.isArray(a)?a:rgb(a);
    const B=Array.isArray(b)?b:rgb(b);
    const value=clamp(Number(t)||0,0,1);
    return `rgb(${A.map((part,index)=>Math.round(part+(B[index]-part)*value)).join(",")})`;
  }

  function ramp(value,stops,colors){
    const n=Number(value);
    if(!Number.isFinite(n))return colors.pending||"#263137";
    if(n<=stops[0])return colors[0];
    if(n>=stops.at(-1))return colors.at(-1);

    for(let index=1;index<stops.length;index++){
      if(n>stops[index])continue;
      const start=stops[index-1];
      const end=stops[index];
      const t=(Math.log1p(Math.max(0,n))-Math.log1p(Math.max(0,start)))/
        Math.max(1e-12,Math.log1p(end)-Math.log1p(start));
      return mix(colors[index-1],colors[index],t);
    }

    return colors.at(-1);
  }

  function feeColor(rate,colors){
    const palette=Array.isArray(colors.feeScale)&&colors.feeScale.length>=9
      ? colors.feeScale
      : ["#14272d","#20353d","#31544d","#52755a","#79945f","#9cad67","#c0d674","#d0c265","#e6a42b"];
    return ramp(rate,[0,.5,1,2,5,10,25,50,100],palette);
  }

  function typeColor(tile,colors){
    if(tile.boosted)return colors.boosted||colors.accent;
    if(tile.ordinal)return colors.ordinal||"#7657a8";
    const type=String(tile.type||"").toLowerCase();
    if(type.includes("op_return")||type.includes("data"))return colors.data||"#6e7480";
    if(tile.rbf===true)return colors.rbf||"#d65a5a";
    if(tile.rbf===false)return colors.nonRbf||"#4e83d6";
    return colors.unknown||"#56605d";
  }

  function normalizedLog(value,low,high){
    const n=Number(value);
    if(!Number.isFinite(n))return 0;
    return clamp(
      (Math.log1p(Math.max(0,n))-Math.log1p(low))/
      Math.max(1e-12,Math.log1p(high)-Math.log1p(low)),
      0,1
    );
  }

  function color(tile,mode,colors,now=Date.now()){
    const rate=tile.packageFeeRate??tile.feeRate;
    const vsize=Number(tile.vsize);

    if(mode==="type")return typeColor(tile,colors);
    if(mode==="vsize")return mix(colors.sizeLow,colors.sizeHigh,normalizedLog(vsize,50,120000));
    if(mode==="absolute-fee"){
      return mix(
        colors.absoluteFeeLow||colors.sizeLow,
        colors.absoluteFeeHigh||colors.accent,
        normalizedLog(tile.feeSats,100,2_000_000)
      );
    }
    if(mode==="age"){
      const ageHours=(now-Number(tile.firstSeen))/3_600_000;
      return mix(colors.primary,colors.accent,normalizedLog(ageHours,0,720));
    }

    const fee=feeColor(rate,colors);
    if(mode==="fee")return fee;

    // Default: fee rate selects the palette; transaction vBytes modulate it.
    return mix(fee,colors.sizeHigh||colors.primary,.08+normalizedLog(vsize,50,120000)*.28);
  }

  function geometry(tile){
    const side=Math.max(0,Number(tile?.side)||0);
    const x=Number(tile?.x)||0;
    const y=Number(tile?.y)||0;
    return {x,y,side,cx:x+side/2,cy:y+side/2};
  }

  function drawTile(ctx,tile,css,colors,colorMode,alpha,now){
    const g=geometry(tile);
    if(!(g.side>0)||alpha<=0)return;

    const x=g.x*css;
    const y=g.y*css;
    const side=g.side*css;

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=color(tile,colorMode,colors,now);
    ctx.fillRect(x-.12,y-.12,side+.24,side+.24);

    if(side>=3.2){
      ctx.strokeStyle=`rgba(0,0,0,${side>=12?.42:.26})`;
      ctx.lineWidth=side>=12?.72:.42;
      ctx.strokeRect(x+.35,y+.35,Math.max(.1,side-.7),Math.max(.1,side-.7));
    }

    if(side>=24){
      ctx.strokeStyle="rgba(255,255,255,.18)";
      ctx.lineWidth=.55;
      ctx.beginPath();
      ctx.moveTo(x+1,y+1);
      ctx.lineTo(x+side-1,y+1);
      ctx.stroke();
    }

    if(side>=52&&!tile.__fragment){
      const rate=Number(tile.packageFeeRate??tile.feeRate);
      const btc=Number(tile.valueSats)/1e8;
      ctx.fillStyle="rgba(0,0,0,.78)";
      ctx.font='9px "IBM Plex Mono",ui-monospace,monospace';
      ctx.textAlign="left";
      ctx.textBaseline="top";
      ctx.fillText(Number.isFinite(rate)?`${rate.toFixed(rate<1?3:1)} sat/vB`:"fee pending",x+4,y+4);
      if(side>=70&&Number.isFinite(btc))ctx.fillText(`${btc.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`,x+4,y+16);
    }

    ctx.restore();
  }

  function drawLayer(ctx,layout,css,colors,colorMode,alpha,now){
    for(const tile of layout?.tiles||[])drawTile(ctx,tile,css,colors,colorMode,alpha,now);
  }

  function outline(ctx,tile,css,stroke,width){
    if(!tile)return;
    const g=geometry(tile);
    const x=g.x*css;
    const y=g.y*css;
    const side=g.side*css;
    ctx.save();
    ctx.strokeStyle=stroke;
    ctx.lineWidth=width;
    ctx.shadowColor=stroke;
    ctx.shadowBlur=width>1?8:4;
    const inset=Math.max(.75,width/2);
    ctx.strokeRect(x+inset,y+inset,Math.max(.1,side-inset*2),Math.max(.1,side-inset*2));
    ctx.restore();
  }

  function draw(canvas,layout,{
    fromLayout=null,
    progress=1,
    selectedTxid="",
    hoverTxid="",
    colorMode="fee-vbytes",
    themeId="zzx-default"
  }={}){
    if(!canvas||!layout)return;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=canvasSize(canvas);
    const theme=W.ZZXMempoolTilesThemes.get(themeId);
    const colors=theme.colors||{};
    const t=clamp(Number(progress)||0,0,1);
    const now=Date.now();

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);
    ctx.fillStyle=colors.background||"#020302";
    ctx.fillRect(0,0,css,css);

    // Crossfade complete atlases. Unlike geometric interpolation, both layers
    // remain exact square dissections, so live updates never open empty seams.
    if(fromLayout&&t<1){
      drawLayer(ctx,fromLayout,css,colors,colorMode,1,now);
      drawLayer(ctx,layout,css,colors,colorMode,t,now);
    }else{
      drawLayer(ctx,layout,css,colors,colorMode,1,now);
    }

    outline(ctx,layout.byTxid?.get(selectedTxid),css,colors.selected||"#fff",2.2);
    outline(ctx,layout.byTxid?.get(hoverTxid),css,colors.hover||colors.accent||"#e6a42b",1.25);

    ctx.save();
    ctx.strokeStyle=colors.border||colors.accent||"#e6a42b";
    ctx.globalAlpha=.72;
    ctx.lineWidth=1;
    ctx.strokeRect(.5,.5,css-1,css-1);
    ctx.restore();
  }

  W.ZZXMempoolTilesRenderer=Object.freeze({
    __version:5,
    feeColor,
    typeColor,
    color,
    geometry,
    draw
  });
})();
