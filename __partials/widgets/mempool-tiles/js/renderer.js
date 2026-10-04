// __partials/widgets/mempool-tiles/js/renderer.js
// v3 — restrained regular transaction tile grid renderer
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesRenderer?.__version>=3)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function canvasSize(canvas){
    const rect=canvas.getBoundingClientRect();

    const css=Math.max(
      260,
      Math.floor(
        Math.min(
          rect.width||720,
          rect.height||rect.width||720
        )
      )
    );

    const dpr=Math.max(
      1,
      Math.min(3,W.devicePixelRatio||1)
    );

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
      ? [
          parseInt(value.slice(0,2),16),
          parseInt(value.slice(2,4),16),
          parseInt(value.slice(4,6),16)
        ]
      : [80,80,80];
  }

  function mix(a,b,t){
    return `rgb(${
      Math.round(a[0]+(b[0]-a[0])*t)
    },${
      Math.round(a[1]+(b[1]-a[1])*t)
    },${
      Math.round(a[2]+(b[2]-a[2])*t)
    })`;
  }

  function feeColor(rate,colors){
    const anchors=[
      [0.000,"#152229"],
      [0.500,"#20353d"],
      [1.000,"#31544d"],
      [2.000,"#52755a"],
      [5.000,"#79945f"],
      [10.00,"#9cad67"],
      [25.00,colors.feeHigh||"#c0d674"],
      [50.00,"#d0c265"],
      [100.0,colors.boosted||"#e6a42b"]
    ];

    const value=Number(rate);

    if(!Number.isFinite(value)){
      return colors.pending||"#263137";
    }

    if(value<=anchors[0][0])return anchors[0][1];
    if(value>=anchors.at(-1)[0])return anchors.at(-1)[1];

    for(let index=1;index<anchors.length;index++){
      if(value>anchors[index][0])continue;

      const [av,ac]=anchors[index-1];
      const [bv,bc]=anchors[index];
      const A=rgb(ac);
      const B=rgb(bc);

      const t=clamp(
        (
          Math.log1p(Math.max(0,value))-
          Math.log1p(av)
        )/
        Math.max(
          1e-9,
          Math.log1p(bv)-Math.log1p(av)
        ),
        0,
        1
      );

      return mix(A,B,t);
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

    if(tile.rbf===true)return colors.rbf||"#d65a5a";
    if(tile.rbf===false)return colors.nonRbf||"#4e83d6";

    return colors.unknown||"#56605d";
  }

  function color(tile,mode,colors){
    return mode==="type"
      ? typeColor(tile,colors)
      : feeColor(
          tile.packageFeeRate??tile.feeRate,
          colors
        );
  }

  function previousMap(layout){
    return new Map(
      (layout?.tiles||[]).map(
        tile=>[tile.txid,tile]
      )
    );
  }

  function geometry(tile){
    if(
      Number.isFinite(tile?.cx)&&
      Number.isFinite(tile?.cy)&&
      Number.isFinite(tile?.side)
    ){
      return {
        cx:tile.cx,
        cy:tile.cy,
        side:tile.side
      };
    }

    /* Compatibility with v1/v2 packed layouts during a hot update. */
    const side=Number(tile?.side)||0;
    const x=Number(tile?.x)||0;
    const y=Number(tile?.y)||0;

    return {
      cx:x+side/2,
      cy:y+side/2,
      side
    };
  }

  function drawSquare(ctx,tile,geom,fill,alpha,colors){
    if(!(geom.side>.000001)||alpha<=0)return;

    const x=geom.cx-geom.side/2;
    const y=geom.cy-geom.side/2;
    const s=geom.side;

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=fill;
    ctx.fillRect(x,y,s,s);

    if(s>=5){
      ctx.strokeStyle="rgba(255,255,255,.08)";
      ctx.lineWidth=.55;
      ctx.strokeRect(
        x+.5,
        y+.5,
        Math.max(.1,s-1),
        Math.max(.1,s-1)
      );
    }

    if(s>=18){
      ctx.strokeStyle="rgba(255,255,255,.15)";
      ctx.lineWidth=.55;
      ctx.beginPath();
      ctx.moveTo(x+.5,y+.5);
      ctx.lineTo(x+s-.5,y+.5);
      ctx.stroke();
    }

    if(s>=34){
      const rate=Number(
        tile.packageFeeRate??tile.feeRate
      );

      ctx.fillStyle="rgba(0,0,0,.76)";
      ctx.globalAlpha=.92*alpha;
      ctx.font='9px "IBM Plex Mono", monospace';
      ctx.textAlign="left";
      ctx.textBaseline="top";

      ctx.fillText(
        Number.isFinite(rate)
          ? `${rate.toFixed(rate<1?3:1)} sat/vB`
          : "fee pending",
        x+4,
        y+3
      );
    }

    ctx.restore();
  }

  function draw(
    canvas,
    layout,
    {
      fromLayout=null,
      progress=1,
      selectedTxid="",
      hoverTxid="",
      colorMode="fee"
    }={}
  ){
    if(!canvas||!layout)return;

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=canvasSize(canvas);

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);

    const theme=W.ZZXMempoolTilesThemes.get();
    const colors=theme.colors||{};
    const pad=7;
    const inner=css-pad*2;

    const bg=ctx.createRadialGradient(
      css*.48,
      css*.42,
      css*.04,
      css*.50,
      css*.50,
      css*.74
    );

    bg.addColorStop(0,"#07100b");
    bg.addColorStop(.60,"#040705");
    bg.addColorStop(1,colors.background||"#020302");

    ctx.fillStyle=bg;
    ctx.fillRect(0,0,css,css);

    const cellPx=inner/layout.gridN;

    /*
     * The lattice is deliberately subtle. It establishes that this is Tiles,
     * not Specs/Goggles, without visually competing with thousands of TXs.
     */
    if(cellPx>=7){
      ctx.save();
      ctx.strokeStyle="rgba(192,214,116,.026)";
      ctx.lineWidth=.45;

      for(let i=1;i<layout.gridN;i++){
        const p=pad+i*cellPx;

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
    }

    const prior=previousMap(fromLayout);
    const t=clamp(Number(progress)||0,0,1);
    const currentIds=new Set(
      layout.tiles.map(tile=>tile.txid)
    );

    if(t<1){
      for(const [txid,old] of prior){
        if(currentIds.has(txid))continue;

        const g=geometry(old);

        drawSquare(
          ctx,
          old,
          {
            cx:pad+g.cx*inner,
            cy:pad+g.cy*inner,
            side:g.side*inner
          },
          color(old,colorMode,colors),
          1-t,
          colors
        );
      }
    }

    for(const tile of layout.tiles){
      const next=geometry(tile);
      const old=prior.get(tile.txid);

      let cx=next.cx;
      let cy=next.cy;
      let side=next.side;
      let alpha=1;

      if(old&&t<1){
        const before=geometry(old);

        cx=before.cx+(next.cx-before.cx)*t;
        cy=before.cy+(next.cy-before.cy)*t;
        side=before.side+(next.side-before.side)*t;
      }else if(!old&&t<1){
        side=next.side*(.18+.82*t);
        alpha=t;
      }

      drawSquare(
        ctx,
        tile,
        {
          cx:pad+cx*inner,
          cy:pad+cy*inner,
          side:Math.max(1,side*inner)
        },
        color(tile,colorMode,colors),
        alpha,
        colors
      );
    }

    for(const [txid,width,stroke] of [
      [selectedTxid,2,colors.selected||"#fff"],
      [hoverTxid,1.2,colors.border||"#e6a42b"]
    ]){
      if(!txid)continue;

      const tile=layout.byTxid.get(txid);
      if(!tile)continue;

      const g=geometry(tile);
      const cx=pad+g.cx*inner;
      const cy=pad+g.cy*inner;
      const side=Math.max(2,g.side*inner);

      ctx.save();
      ctx.strokeStyle=stroke;
      ctx.lineWidth=width;
      ctx.shadowColor=stroke;
      ctx.shadowBlur=width>1?7:3;
      ctx.strokeRect(
        cx-side/2-.75,
        cy-side/2-.75,
        side+1.5,
        side+1.5
      );
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle="rgba(192,214,116,.20)";
    ctx.lineWidth=1;
    ctx.strokeRect(1,1,css-2,css-2);
    ctx.restore();
  }

  W.ZZXMempoolTilesRenderer=Object.freeze({
    __version:3,
    feeColor,
    typeColor,
    color,
    geometry,
    draw
  });
})();
