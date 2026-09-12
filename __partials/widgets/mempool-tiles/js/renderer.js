// __partials/widgets/mempool-tiles/js/renderer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesRenderer?.__version>=2)return;

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
      Math.min(
        3,
        W.devicePixelRatio||1
      )
    );

    const px=Math.floor(css*dpr);

    if(
      canvas.width!==px ||
      canvas.height!==px
    ){
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

  function interpolateColor(a,b,t){
    return `rgb(${
      Math.round(a[0]+(b[0]-a[0])*t)
    },${
      Math.round(a[1]+(b[1]-a[1])*t)
    },${
      Math.round(a[2]+(b[2]-a[2])*t)
    })`;
  }

  function feeColor(rate,colors){
    /*
     * Absolute sat/vB palette. It stays predominantly ZZX green and only moves
     * into amber under genuine fee pressure, rather than turning the whole
     * block into neon lime.
     */
    const anchors=[
      [0.000,"#142229"],
      [0.500,"#1f3941"],
      [1.000,"#2a5b4e"],
      [2.000,"#4c7857"],
      [5.000,"#7f9f60"],
      [10.00,"#a9bd6c"],
      [25.00,colors.feeHigh||"#c0d674"],
      [50.00,"#d7c45d"],
      [100.0,colors.boosted||"#e6a42b"]
    ];

    const value=Number(rate);

    if(!Number.isFinite(value)){
      return colors.pending||"#263137";
    }

    if(value<=anchors[0][0]){
      return anchors[0][1];
    }

    if(value>=anchors.at(-1)[0]){
      return anchors.at(-1)[1];
    }

    for(let i=1;i<anchors.length;i++){
      if(value>anchors[i][0])continue;

      const [av,ac]=anchors[i-1];
      const [bv,bc]=anchors[i];
      const A=rgb(ac);
      const B=rgb(bc);

      const t=clamp(
        (
          Math.log1p(value)-
          Math.log1p(av)
        ) /
        Math.max(
          1e-9,
          Math.log1p(bv)-
          Math.log1p(av)
        ),
        0,
        1
      );

      return interpolateColor(A,B,t);
    }

    return anchors.at(-1)[1];
  }

  function typeColor(tile,colors){
    if(tile.boosted){
      return colors.boosted||"#e6a42b";
    }

    if(tile.ordinal){
      return colors.ordinal||"#7657a8";
    }

    const type=String(tile.type||"").toLowerCase();

    if(
      type.includes("op_return") ||
      type.includes("data")
    ){
      return colors.data||"#6e7480";
    }

    if(tile.rbf===true){
      return colors.rbf||"#d65a5a";
    }

    if(tile.rbf===false){
      return colors.nonRbf||"#4e83d6";
    }

    return colors.unknown||"#56605d";
  }

  function color(tile,mode,colors){
    return mode==="type"
      ? typeColor(tile,colors)
      : feeColor(
          tile.packageFeeRate ??
          tile.feeRate,
          colors
        );
  }

  function oldMap(layout){
    return new Map(
      (layout?.tiles||[])
        .map(tile=>[tile.txid,tile])
    );
  }

  function drawTile(
    ctx,
    tile,
    geom,
    fill,
    alpha=1
  ){
    const {x,y,size}=geom;

    if(
      size<=.1 ||
      alpha<=0
    ){
      return;
    }

    /*
     * Tiny transactions remain visible. The gap scales down aggressively
     * instead of erasing 1x1 logical squares at high transaction counts.
     */
    const gap=
      size>=18
        ? .72
        : size>=7
          ? .34
          : size>=2
            ? .12
            : 0;

    const px=x+gap;
    const py=y+gap;
    const ps=Math.max(
      .1,
      size-gap*2
    );

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=fill;
    ctx.fillRect(px,py,ps,ps);

    if(size>=3){
      ctx.strokeStyle=
        size>=12
          ? "rgba(255,255,255,.12)"
          : "rgba(255,255,255,.055)";

      ctx.lineWidth=
        size>=12
          ? .65
          : .35;

      ctx.strokeRect(
        px+.5,
        py+.5,
        Math.max(.1,ps-1),
        Math.max(.1,ps-1)
      );
    }

    if(size>=16){
      ctx.save();
      ctx.globalAlpha=.16*alpha;
      ctx.strokeStyle="rgba(255,255,255,.75)";
      ctx.lineWidth=.55;
      ctx.beginPath();
      ctx.moveTo(px+.5,py+.5);
      ctx.lineTo(px+ps-.5,py+.5);
      ctx.stroke();
      ctx.restore();
    }

    if(size>=40){
      ctx.fillStyle="rgba(0,0,0,.75)";
      ctx.globalAlpha=.90*alpha;
      ctx.font='9px "IBM Plex Mono", monospace';
      ctx.textAlign="left";
      ctx.textBaseline="top";

      const rate=Number(
        tile.packageFeeRate ??
        tile.feeRate
      );

      ctx.fillText(
        Number.isFinite(rate)
          ? `${rate.toFixed(rate<1?3:1)} sat/vB`
          : "fee pending",
        px+4,
        py+3
      );

      if(size>=55){
        const btc=Number(tile.valueSats)/1e8;

        ctx.fillText(
          Number.isFinite(btc)
            ? `${btc.toFixed(btc>=1?3:6)} BTC`
            : "value pending",
          px+4,
          py+14
        );
      }

      if(size>=74){
        ctx.fillText(
          String(tile.txid||"").slice(0,12),
          px+4,
          py+25
        );
      }
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
    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=canvasSize(canvas);

    ctx.setTransform(
      dpr,0,0,dpr,0,0
    );

    ctx.clearRect(
      0,0,css,css
    );

    const theme=
      W.ZZXMempoolTilesThemes.get();

    const colors=
      theme.colors||{};

    const pad=6;
    const inner=css-pad*2;

    /*
     * Quiet instrument background. The old 10x10 graph-paper grid made the
     * independently packed square transactions read as a broken chart.
     */
    const bg=ctx.createRadialGradient(
      css*.46,
      css*.42,
      css*.05,
      css*.50,
      css*.50,
      css*.76
    );

    bg.addColorStop(
      0,
      "#07100b"
    );

    bg.addColorStop(
      .58,
      "#040705"
    );

    bg.addColorStop(
      1,
      colors.background||"#020302"
    );

    ctx.fillStyle=bg;
    ctx.fillRect(
      0,0,css,css
    );

    const prior=oldMap(fromLayout);
    const t=clamp(
      Number(progress)||0,
      0,
      1
    );

    const currentIds=new Set(
      layout.tiles.map(
        tile=>tile.txid
      )
    );

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
          color(
            old,
            colorMode,
            colors
          ),
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
        x=
          old.x+
          (tile.x-old.x)*t;

        y=
          old.y+
          (tile.y-old.y)*t;

        side=
          old.side+
          (tile.side-old.side)*t;
      }else if(!old&&t<1){
        const target=tile.side;

        side=
          target*
          (.10+.90*t);

        x=
          tile.x+
          (target-side)/2;

        y=
          tile.y+
          (target-side)/2;

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
        color(
          tile,
          colorMode,
          colors
        ),
        alpha
      );
    }

    for(const [txid,width,stroke] of [
      [
        selectedTxid,
        2,
        colors.selected||"#fff"
      ],
      [
        hoverTxid,
        1.25,
        colors.border||"#e6a42b"
      ]
    ]){
      if(!txid)continue;

      const tile=
        layout.byTxid.get(txid);

      if(!tile)continue;

      ctx.save();
      ctx.strokeStyle=stroke;
      ctx.lineWidth=width;
      ctx.shadowColor=stroke;
      ctx.shadowBlur=
        width>1
          ? 8
          : 4;

      ctx.strokeRect(
        pad+tile.x*inner+.5,
        pad+tile.y*inner+.5,
        Math.max(
          1,
          tile.side*inner-1
        ),
        Math.max(
          1,
          tile.side*inner-1
        )
      );

      ctx.restore();
    }

    /*
     * Single restrained frame. The contents themselves are the visualization;
     * no extra chart grid is drawn over them.
     */
    ctx.save();
    ctx.strokeStyle=
      "rgba(192,214,116,.24)";
    ctx.lineWidth=1;
    ctx.strokeRect(
      1,1,css-2,css-2
    );
    ctx.restore();
  }

  W.ZZXMempoolTilesRenderer=Object.freeze({
    __version:2,
    feeColor,
    typeColor,
    color,
    draw
  });
})();
