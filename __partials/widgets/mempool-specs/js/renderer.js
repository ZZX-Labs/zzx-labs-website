// __partials/widgets/mempool-specs/js/renderer.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Renderer?.__version>=9)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function size(canvas){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(260,Math.floor(rect.width||720));
    const height=Math.max(260,Math.floor(rect.height||width));
    const css=Math.max(260,Math.floor(Math.min(width,height)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);

    if(canvas.width!==px||canvas.height!==px){
      canvas.width=px;
      canvas.height=px;
    }

    return {css,dpr};
  }

  function previousMap(layout){
    if(!layout?.tiles)return new Map();
    return new Map(layout.tiles.map(tile=>[tile.txid||tile.id,tile]));
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

  function feeColor(rate){
    const anchors=[
      [0.000,"#142229"],
      [0.125,"#1b3440"],
      [0.250,"#224b59"],
      [0.500,"#2a6257"],
      [1.000,"#3e8561"],
      [2.000,"#69a86b"],
      [5.000,"#c0d674"],
      [10.00,"#e6a42b"],
      [25.00,"#df873d"],
      [50.00,"#d67474"],
      [100.0,"#ff4d4d"]
    ];

    const value=Number(rate);
    if(!Number.isFinite(value))return "#293238";
    if(value<=anchors[0][0])return anchors[0][1];
    if(value>=anchors.at(-1)[0])return anchors.at(-1)[1];

    for(let i=1;i<anchors.length;i++){
      if(value>anchors[i][0])continue;

      const [aV,aC]=anchors[i-1];
      const [bV,bC]=anchors[i];
      const A=rgb(aC),B=rgb(bC);
      const logA=Math.log1p(aV);
      const logB=Math.log1p(bV);
      const logV=Math.log1p(Math.max(0,value));
      const t=clamp(
        (logV-logA)/Math.max(1e-9,logB-logA),
        0,
        1
      );

      return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`;
    }

    return anchors.at(-1)[1];
  }

  function squareSide(tile){
    const side=Number(tile?.side);
    if(Number.isFinite(side)&&side>0)return side;

    // One-refresh compatibility with the previous v4 rectangle layout.
    const w=Number(tile?.w);
    const h=Number(tile?.h);
    if(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0){
      return Math.min(w,h);
    }

    return 0;
  }

  function interpolate(tile,fromMap,progress){
    const t=clamp(
      Number.isFinite(progress)?progress:1,
      0,
      1
    );

    const key=tile.txid||tile.id;
    const old=fromMap?.get(key);
    const side=squareSide(tile);

    if(!old){
      const cx=tile.x+side/2;
      const cy=tile.y+side/2;
      const scale=.08+t*.92;
      const nowSide=side*scale;

      return {
        x:cx-nowSide/2,
        y:cy-nowSide/2,
        side:nowSide,
        alpha:t
      };
    }

    const oldSide=squareSide(old);
    const nextSide=oldSide+(side-oldSide)*t;

    return {
      x:Number(old.x||0)+(tile.x-Number(old.x||0))*t,
      y:Number(old.y||0)+(tile.y-Number(old.y||0))*t,
      side:nextSide,
      alpha:1
    };
  }

  function formatBtc(sats){
    const n=Number(sats);
    if(!Number.isFinite(n))return "value pending";
    const btc=n/1e8;

    if(btc>=1000)return `${btc.toFixed(0)} BTC`;
    if(btc>=100)return `${btc.toFixed(1)} BTC`;
    if(btc>=10)return `${btc.toFixed(2)} BTC`;
    if(btc>=1)return `${btc.toFixed(3)} BTC`;
    if(btc>=.01)return `${btc.toFixed(4)} BTC`;
    if(btc>=.0001)return `${btc.toFixed(6)} BTC`;
    return `${Math.round(n).toLocaleString()} sat`;
  }

  function drawTile(ctx,tile,rect,colors,alpha=1){
    const x=rect.x;
    const y=rect.y;
    const size=rect.size;

    if(size<=.12||alpha<=0)return;

    const rate=Number(tile.packageFeeRate??tile.feeRate);
    const fill=feeColor(rate);

    /*
     * Every visible primitive is a square. The same inset is subtracted from
     * both axes, so even the smallest candidate transaction remains square.
     */
    const gap=size>=18
      ? .9
      : size>=7
        ? .45
        : size>=2
          ? .18
          : 0;

    const px=x+gap;
    const py=y+gap;
    const ps=Math.max(.12,size-gap*2);

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=tile.valueKnown===false
      ? colors.pending||"#263137"
      : fill;
    ctx.fillRect(px,py,ps,ps);

    if(size>=3){
      ctx.strokeStyle=size>=12
        ? "rgba(255,255,255,.14)"
        : "rgba(255,255,255,.07)";
      ctx.lineWidth=size>=12?.75:.45;
      ctx.strokeRect(px+.5,py+.5,Math.max(.12,ps-1),Math.max(.12,ps-1));
    }

    if(size>=8&&tile.valueKnown!==false){
      ctx.save();
      ctx.globalAlpha=.22*alpha;
      ctx.strokeStyle=fill;
      ctx.lineWidth=Math.max(.5,Math.min(2,size*.055));
      ctx.beginPath();
      ctx.moveTo(px,py+.5);
      ctx.lineTo(px+ps,py+.5);
      ctx.stroke();
      ctx.restore();
    }

    if(size>=31){
      ctx.globalAlpha=.94*alpha;
      ctx.fillStyle="rgba(0,0,0,.78)";
      const font=Math.max(8,Math.min(11,size*.17));
      ctx.font=`${font}px "IBM Plex Mono", monospace`;
      ctx.textAlign="left";
      ctx.textBaseline="top";

      ctx.fillText(
        formatBtc(tile.valueSats),
        px+4,
        py+3
      );

      if(Number.isFinite(rate)&&size>=font*2+9){
        ctx.fillText(
          `${rate<1?rate.toFixed(3):rate.toFixed(1)} sat/vB`,
          px+4,
          py+5+font
        );
      }

      if(size>=58){
        ctx.fillText(
          String(tile.txid||"").slice(0,10),
          px+4,
          py+7+font*2
        );
      }
    }

    ctx.restore();
  }

  function drawGrid(ctx,css,pad,colors){
    ctx.save();
    ctx.strokeStyle=colors.gridLine||"rgba(255,255,255,.022)";
    ctx.lineWidth=.45;

    const inner=css-pad*2;

    for(let i=1;i<8;i++){
      const p=pad+(inner*i/8);

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

  function draw(canvas,layout,blockView,opts={}){
    if(!canvas||!layout||!blockView)return;

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const sized=size(canvas);
    const css=sized.css;
    const dpr=sized.dpr;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);

    const theme=NS.Theme?.get?.()||{};
    const colors=theme.colors||{};
    const pad=6;
    const inner=css-pad*2;
    const progress=Number.isFinite(opts.progress)?opts.progress:1;
    const fromMap=opts.fromMap||previousMap(opts.fromLayout||null);
    const selectedId=opts.selectedId||"";
    const hoverId=opts.hoverId||"";

    const bg=ctx.createRadialGradient(
      css*.50,css*.42,css*.04,
      css*.50,css*.50,css*.75
    );

    bg.addColorStop(0,"#080b09");
    bg.addColorStop(.52,"#040504");
    bg.addColorStop(1,colors.canvasBg||"#010101");

    ctx.fillStyle=bg;
    ctx.fillRect(0,0,css,css);
    drawGrid(ctx,css,pad,colors);

    /*
     * Removed candidate transactions fade out as surviving txids move and
     * resize into the newly packed next-block square field.
     */
    if(progress<1&&fromMap?.size){
      const current=new Set(
        layout.tiles.map(tile=>tile.txid||tile.id)
      );

      for(const [key,old] of fromMap.entries()){
        if(current.has(key))continue;

        const oldSide=squareSide(old);

        drawTile(
          ctx,
          old,
          {
            x:pad+Number(old.x||0)*inner,
            y:pad+Number(old.y||0)*inner,
            size:oldSide*inner
          },
          colors,
          1-progress
        );
      }
    }

    for(const tile of layout.tiles){
      const p=interpolate(tile,fromMap,progress);

      drawTile(
        ctx,
        tile,
        {
          x:pad+p.x*inner,
          y:pad+p.y*inner,
          size:p.side*inner
        },
        colors,
        p.alpha
      );
    }

    for(const [id,width,color] of [
      [selectedId,2,colors.selected||"#ffffff"],
      [hoverId,1.2,colors.border||"#e6a42b"]
    ]){
      if(!id)continue;

      const tile=layout.byId.get(id)||layout.byTxid.get(id);
      if(!tile)continue;

      const side=squareSide(tile);
      const x=pad+tile.x*inner;
      const y=pad+tile.y*inner;
      const s=side*inner;

      ctx.save();
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.shadowColor=color;
      ctx.shadowBlur=width>1?7:3;
      ctx.strokeRect(
        x+.5,
        y+.5,
        Math.max(1,s-1),
        Math.max(1,s-1)
      );
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=1.4;
    ctx.shadowColor=colors.border||"#e6a42b";
    ctx.shadowBlur=4;
    ctx.strokeRect(1,1,css-2,css-2);
    ctx.restore();
  }

  NS.Renderer=Object.freeze({
    __version:9,
    draw,
    previousMap,
    feeColor,
    formatBtc,
    squareSide
  });
})();
