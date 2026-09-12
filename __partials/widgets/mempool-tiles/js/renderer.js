// __partials/widgets/mempool-tiles/js/renderer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesRenderer?.__version>=1)return;

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
    const s=String(hex||"").replace("#","");
    return /^[0-9a-f]{6}$/i.test(s)
      ? [
          parseInt(s.slice(0,2),16),
          parseInt(s.slice(2,4),16),
          parseInt(s.slice(4,6),16)
        ]
      : [80,80,80];
  }

  function feeColor(rate,colors){
    const anchors=[
      [0.0,colors.feeLow||"#265f26"],
      [2.0,colors.feeLow||"#265f26"],
      [8.0,colors.feeMid||"#3f9f3f"],
      [30.0,colors.feeHigh||"#5aff4e"],
      [100.0,"#ddff78"]
    ];

    const value=Number(rate);
    if(!Number.isFinite(value))return colors.pending||"#263137";
    if(value<=anchors[0][0])return anchors[0][1];
    if(value>=anchors.at(-1)[0])return anchors.at(-1)[1];

    for(let i=1;i<anchors.length;i++){
      if(value>anchors[i][0])continue;

      const [av,ac]=anchors[i-1];
      const [bv,bc]=anchors[i];
      const A=rgb(ac);
      const B=rgb(bc);
      const t=clamp(
        (Math.log1p(value)-Math.log1p(av)) /
        Math.max(1e-9,Math.log1p(bv)-Math.log1p(av)),
        0,
        1
      );

      return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`;
    }

    return anchors.at(-1)[1];
  }

  function typeColor(tile,colors){
    if(tile.boosted)return colors.boosted||"#e6a42b";
    if(tile.ordinal)return colors.ordinal||"#7657a8";

    const type=String(tile.type||"").toLowerCase();

    if(type.includes("op_return")||type.includes("data")){
      return colors.data||"#6e7480";
    }

    if(tile.rbf)return colors.rbf||"#d65a5a";
    if(tile.rbf===false)return colors.nonRbf||"#4e83d6";

    return colors.unknown||"#56605d";
  }

  function color(tile,mode,colors){
    return mode==="type"
      ? typeColor(tile,colors)
      : feeColor(tile.packageFeeRate??tile.feeRate,colors);
  }

  function oldMap(layout){
    return new Map((layout?.tiles||[]).map(tile=>[tile.txid,tile]));
  }

  function drawTile(ctx,tile,geom,fill,alpha=1){
    const {x,y,size}=geom;
    if(size<=.1||alpha<=0)return;

    const gap=size>=18?.8:size>=7?.42:size>=2?.15:0;
    const px=x+gap;
    const py=y+gap;
    const ps=Math.max(.1,size-gap*2);

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=fill;
    ctx.fillRect(px,py,ps,ps);

    if(size>=3){
      ctx.strokeStyle="rgba(255,255,255,.09)";
      ctx.lineWidth=size>=12?.7:.4;
      ctx.strokeRect(px+.5,py+.5,Math.max(.1,ps-1),Math.max(.1,ps-1));
    }

    if(size>=36){
      ctx.fillStyle="rgba(0,0,0,.72)";
      ctx.globalAlpha=.92*alpha;
      ctx.font='9px "IBM Plex Mono", monospace';
      ctx.textAlign="left";
      ctx.textBaseline="top";

      const rate=Number(tile.packageFeeRate??tile.feeRate);
      ctx.fillText(
        Number.isFinite(rate)?`${rate.toFixed(rate<1?3:1)} sat/vB`:"fee pending",
        px+4,
        py+3
      );

      if(size>=52){
        const btc=Number(tile.valueSats)/1e8;
        ctx.fillText(
          Number.isFinite(btc)?`${btc.toFixed(btc>=1?3:6)} BTC`:"value pending",
          px+4,
          py+14
        );
      }
    }

    ctx.restore();
  }

  function draw(canvas,layout,{
    fromLayout=null,
    progress=1,
    selectedTxid="",
    hoverTxid="",
    colorMode="fee"
  }={}){
    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=canvasSize(canvas);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);

    const theme=W.ZZXMempoolTilesThemes.get();
    const colors=theme.colors||{};
    const pad=6;
    const inner=css-pad*2;

    ctx.fillStyle=colors.background||"#020302";
    ctx.fillRect(0,0,css,css);

    ctx.save();
    ctx.strokeStyle=colors.grid||"rgba(255,255,255,.025)";
    ctx.lineWidth=.5;
    for(let i=1;i<10;i++){
      const p=pad+inner*i/10;
      ctx.beginPath();
      ctx.moveTo(p,pad);
      ctx.lineTo(p,css-pad);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad,p);
      ctx.lineTo(css-pad,p);
      ctx.stroke();
    }
    ctx.restore();

    const prior=oldMap(fromLayout);
    const t=clamp(Number(progress)||0,0,1);
    const currentIds=new Set(layout.tiles.map(tile=>tile.txid));

    if(t<1){
      for(const [txid,old] of prior){
        if(currentIds.has(txid))continue;
        drawTile(
          ctx,
          old,
          {
            x:pad+old.x*inner,
            y:pad+old.y*inner,
            size:old.side*inner
          },
          color(old,colorMode,colors),
          1-t
        );
      }
    }

    for(const tile of layout.tiles){
      const old=prior.get(tile.txid);

      let x=tile.x;
      let y=tile.y;
      let side=tile.side;
      let alpha=1;

      if(old&&t<1){
        x=old.x+(tile.x-old.x)*t;
        y=old.y+(tile.y-old.y)*t;
        side=old.side+(tile.side-old.side)*t;
      }else if(!old&&t<1){
        const target=tile.side;
        side=target*(.08+.92*t);
        x=tile.x+(target-side)/2;
        y=tile.y+(target-side)/2;
        alpha=t;
      }

      drawTile(
        ctx,
        tile,
        {
          x:pad+x*inner,
          y:pad+y*inner,
          size:side*inner
        },
        color(tile,colorMode,colors),
        alpha
      );
    }

    for(const [txid,width,stroke] of [
      [selectedTxid,2,colors.selected||"#fff"],
      [hoverTxid,1.2,colors.border||"#e6a42b"]
    ]){
      if(!txid)continue;
      const tile=layout.byTxid.get(txid);
      if(!tile)continue;

      ctx.save();
      ctx.strokeStyle=stroke;
      ctx.lineWidth=width;
      ctx.shadowColor=stroke;
      ctx.shadowBlur=width>1?7:3;
      ctx.strokeRect(
        pad+tile.x*inner+.5,
        pad+tile.y*inner+.5,
        Math.max(1,tile.side*inner-1),
        Math.max(1,tile.side*inner-1)
      );
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=1.2;
    ctx.strokeRect(1,1,css-2,css-2);
    ctx.restore();
  }

  W.ZZXMempoolTilesRenderer=Object.freeze({
    __version:1,
    feeColor,
    typeColor,
    color,
    draw
  });
})();
