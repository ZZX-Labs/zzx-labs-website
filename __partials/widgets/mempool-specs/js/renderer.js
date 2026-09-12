// __partials/widgets/mempool-specs/js/renderer.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Renderer?.__version>=7)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function size(canvas){
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

  function previousMap(layout){
    if(!layout?.tiles)return new Map();
    return new Map(layout.tiles.map(tile=>[tile.txid||tile.id,tile]));
  }

  function rgb(hex){
    const s=String(hex||"").replace("#","");
    return /^[0-9a-f]{6}$/i.test(s)
      ? [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]
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
    if(!Number.isFinite(value))return "#243137";
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
      const t=clamp((logV-logA)/Math.max(1e-9,logB-logA),0,1);

      return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`;
    }

    return anchors.at(-1)[1];
  }

  function interpolate(tile,fromMap,progress){
    const t=clamp(Number.isFinite(progress)?progress:1,0,1);
    const key=tile.txid||tile.id;
    const old=fromMap?.get(key);

    if(!old){
      const cx=tile.x+tile.w/2;
      const cy=tile.y+tile.h/2;
      const scale=.18+t*.82;

      return {
        x:cx-(tile.w*scale)/2,
        y:cy-(tile.h*scale)/2,
        w:tile.w*scale,
        h:tile.h*scale,
        alpha:t
      };
    }

    return {
      x:old.x+(tile.x-old.x)*t,
      y:old.y+(tile.y-old.y)*t,
      w:old.w+(tile.w-old.w)*t,
      h:old.h+(tile.h-old.h)*t,
      alpha:1
    };
  }

  function drawGrid(ctx,css,pad,colors){
    ctx.save();
    ctx.strokeStyle=colors.gridLine||"rgba(255,255,255,.035)";
    ctx.lineWidth=.5;

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

  function drawReserve(ctx,layout,inner,pad,colors){
    for(const rect of layout.emptyRects||[]){
      const x=pad+rect.x*inner;
      const y=pad+rect.y*inner;
      const w=rect.w*inner;
      const h=rect.h*inner;

      ctx.save();
      ctx.fillStyle=colors.empty||"rgba(255,255,255,.012)";
      ctx.fillRect(x,y,w,h);
      ctx.globalAlpha=.22;
      ctx.strokeStyle=colors.gridLine||"rgba(255,255,255,.05)";
      ctx.lineWidth=.5;

      for(let line=-h;line<w+h;line+=11){
        ctx.beginPath();
        ctx.moveTo(x+line,y+h);
        ctx.lineTo(x+line+h,y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function formatBtc(sats){
    const n=Number(sats);
    if(!Number.isFinite(n))return "—";
    const btc=n/1e8;

    if(btc>=1000)return `${btc.toFixed(0)} BTC`;
    if(btc>=100)return `${btc.toFixed(1)} BTC`;
    if(btc>=10)return `${btc.toFixed(2)} BTC`;
    if(btc>=1)return `${btc.toFixed(3)} BTC`;
    if(btc>=.01)return `${btc.toFixed(4)} BTC`;
    return `${btc.toFixed(6)} BTC`;
  }

  function drawTile(ctx,tile,rect,colors,alpha=1){
    const {x,y,w,h}=rect;
    if(w<=.1||h<=.1||alpha<=0)return;

    const min=Math.min(w,h);
    const inset=Math.min(1.15,Math.max(.18,min*.028));
    const rate=Number(tile.packageFeeRate??tile.feeRate);

    ctx.save();
    ctx.globalAlpha=alpha;

    if(min>16){
      ctx.shadowColor=feeColor(rate);
      ctx.shadowBlur=Math.min(9,min*.12);
    }

    ctx.fillStyle=feeColor(rate);
    ctx.fillRect(x+inset,y+inset,Math.max(.1,w-inset*2),Math.max(.1,h-inset*2));
    ctx.shadowBlur=0;

    if(min>2.5){
      ctx.strokeStyle=colors.tileOutline||"rgba(0,0,0,.72)";
      ctx.lineWidth=min>18?1:.5;
      ctx.strokeRect(x+inset+.25,y+inset+.25,Math.max(.1,w-inset*2-.5),Math.max(.1,h-inset*2-.5));
    }

    if(min>36&&w>62){
      ctx.globalAlpha=.92*alpha;
      ctx.fillStyle="rgba(0,0,0,.82)";
      const font=Math.max(8,Math.min(11,min*.15));
      ctx.font=`${font}px "IBM Plex Mono", monospace`;
      ctx.textAlign="left";
      ctx.textBaseline="top";

      ctx.fillText(formatBtc(tile.valueSats),x+5,y+4);

      if(Number.isFinite(rate)){
        ctx.fillText(
          `${rate<1?rate.toFixed(3):rate.toFixed(1)} sat/vB`,
          x+5,
          y+5+font
        );
      }

      if(min>58&&h>62){
        ctx.fillText(String(tile.txid||"").slice(0,10),x+5,y+6+font*2);
      }
    }

    ctx.restore();
  }

  function draw(canvas,layout,blockView,opts={}){
    if(!canvas||!layout||!blockView)return;

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=size(canvas);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,css,css);

    const theme=NS.Theme?.get?.()||{};
    const colors=theme.colors||{};
    const pad=7;
    const inner=css-pad*2;
    const progress=Number.isFinite(opts.progress)?opts.progress:1;
    const fromMap=opts.fromMap||previousMap(opts.fromLayout||null);
    const selectedId=opts.selectedId||"";
    const hoverId=opts.hoverId||"";

    const bg=ctx.createRadialGradient(css*.50,css*.42,css*.06,css*.50,css*.50,css*.72);
    bg.addColorStop(0,"#0a0d0b");
    bg.addColorStop(.48,"#050605");
    bg.addColorStop(1,colors.canvasBg||"#020202");

    ctx.fillStyle=bg;
    ctx.fillRect(0,0,css,css);

    drawGrid(ctx,css,pad,colors);
    drawReserve(ctx,layout,inner,pad,colors);

    if(progress<1&&fromMap?.size){
      const current=new Set(layout.tiles.map(tile=>tile.txid||tile.id));

      for(const [key,old] of fromMap.entries()){
        if(current.has(key))continue;

        drawTile(
          ctx,
          old,
          {
            x:pad+old.x*inner,
            y:pad+old.y*inner,
            w:old.w*inner,
            h:old.h*inner
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
          w:p.w*inner,
          h:p.h*inner
        },
        colors,
        p.alpha
      );
    }

    for(const [id,width,color] of [
      [selectedId,2,colors.selected||"#ffffff"],
      [hoverId,1.25,colors.border||"#e6a42b"]
    ]){
      if(!id)continue;

      const tile=layout.byId.get(id)||layout.byTxid.get(id);
      if(!tile)continue;

      const x=pad+tile.x*inner;
      const y=pad+tile.y*inner;
      const w=tile.w*inner;
      const h=tile.h*inner;

      ctx.save();
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.shadowColor=color;
      ctx.shadowBlur=width>1?8:4;
      ctx.strokeRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1));
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=1.5;
    ctx.shadowColor=colors.border||"#e6a42b";
    ctx.shadowBlur=5;
    ctx.strokeRect(1,1,css-2,css-2);
    ctx.restore();
  }

  NS.Renderer=Object.freeze({
    __version:7,
    draw,
    previousMap,
    feeColor,
    formatBtc
  });
})();
