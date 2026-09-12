// __partials/widgets/mempool-specs/js/renderer.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Renderer?.__version>=6)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function size(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(220,Math.floor(Math.min(rect.width||520,rect.height||rect.width||520)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.floor(css*dpr);
    if(canvas.width!==px||canvas.height!==px){
      canvas.width=px;
      canvas.height=px;
    }
    return {css,dpr};
  }

  function previousMap(layout){
    if(!layout?.tiles)return null;
    return new Map(layout.tiles.map(tile=>[tile.txid||tile.id,tile]));
  }

  function interpolate(tile,fromMap,progress){
    const t=clamp(Number.isFinite(progress)?progress:1,0,1);
    const key=tile.txid||tile.id;
    const old=fromMap?.get(key);

    if(!old||t>=1){
      return {x:tile.x,y:tile.y,w:tile.w,h:tile.h,alpha:old?1:t};
    }

    return {
      x:old.x+(tile.x-old.x)*t,
      y:old.y+(tile.y-old.y)*t,
      w:old.w+(tile.w-old.w)*t,
      h:old.h+(tile.h-old.h)*t,
      alpha:1
    };
  }

  function hexToRgb(hex){
    const value=String(hex||"").replace("#","");
    if(!/^[0-9a-f]{6}$/i.test(value))return null;
    return {
      r:parseInt(value.slice(0,2),16),
      g:parseInt(value.slice(2,4),16),
      b:parseInt(value.slice(4,6),16)
    };
  }

  function mix(a,b,t){
    const A=hexToRgb(a),B=hexToRgb(b);
    if(!A||!B)return a;
    const u=clamp(t,0,1);
    return `rgb(${Math.round(A.r+(B.r-A.r)*u)},${Math.round(A.g+(B.g-A.g)*u)},${Math.round(A.b+(B.b-A.b)*u)})`;
  }

  function heatColor(rate,stats,theme){
    const visual=theme?.visual||{};
    const cold=visual.cold||"#16323b";
    const cool=visual.cool||"#2a5660";
    const mid=visual.mid||"#5f8b63";
    const hot=visual.hot||"#c0d674";
    const peak=visual.peak||"#e6a42b";
    const value=Number(rate);
    const min=Number(stats?.minRate);
    const max=Number(stats?.maxRate);

    if(!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min){
      return theme?.colors?.pending||"#24383e";
    }

    const logMin=Math.log1p(Math.max(0,min));
    const logMax=Math.log1p(Math.max(0,max));
    const logValue=Math.log1p(Math.max(0,value));
    let t=(logValue-logMin)/Math.max(1e-9,logMax-logMin);
    t=clamp(t,0,1);

    if(t<.25)return mix(cold,cool,t/.25);
    if(t<.5)return mix(cool,mid,(t-.25)/.25);
    if(t<.78)return mix(mid,hot,(t-.5)/.28);
    return mix(hot,peak,(t-.78)/.22);
  }

  function tileRect(tile,inner,pad){
    return {
      x:pad+tile.x*inner,
      y:pad+tile.y*inner,
      w:tile.w*inner,
      h:tile.h*inner
    };
  }

  function drawEmpty(ctx,layout,inner,pad,colors){
    for(const rect of layout.emptyRects||[]){
      const x=pad+rect.x*inner;
      const y=pad+rect.y*inner;
      const w=rect.w*inner;
      const h=rect.h*inner;
      ctx.fillStyle=colors.empty||"rgba(255,255,255,.012)";
      ctx.fillRect(x,y,w,h);

      if(Math.min(w,h)>36){
        ctx.save();
        ctx.globalAlpha=.22;
        ctx.strokeStyle=colors.gridLine||"rgba(255,255,255,.06)";
        ctx.lineWidth=.5;
        for(let line=-h;line<w+h;line+=12){
          ctx.beginPath();
          ctx.moveTo(x+line,y+h);
          ctx.lineTo(x+line+h,y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
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
    ctx.fillStyle=colors.canvasBg||"#030303";
    ctx.fillRect(0,0,css,css);

    const pad=7;
    const inner=css-pad*2;
    const fromMap=opts.fromMap||previousMap(opts.fromLayout||null);
    const progress=Number.isFinite(opts.progress)?opts.progress:1;
    const selectedId=opts.selectedId||"";
    const hoverId=opts.hoverId||"";

    drawEmpty(ctx,layout,inner,pad,colors);

    for(const tile of layout.tiles){
      const p=interpolate(tile,fromMap,progress);
      const x=pad+p.x*inner;
      const y=pad+p.y*inner;
      const w=Math.max(.35,p.w*inner);
      const h=Math.max(.35,p.h*inner);
      const inset=Math.min(.8,Math.max(.12,Math.min(w,h)*.035));

      ctx.globalAlpha=p.alpha;
      ctx.fillStyle=heatColor(tile.packageFeeRate??tile.feeRate,blockView,theme);
      ctx.fillRect(x+inset,y+inset,Math.max(.15,w-inset*2),Math.max(.15,h-inset*2));

      if(Math.min(w,h)>2){
        ctx.strokeStyle=colors.tileOutline||"rgba(255,255,255,.09)";
        ctx.lineWidth=.5;
        ctx.strokeRect(x+inset+.25,y+inset+.25,Math.max(.2,w-inset*2-.5),Math.max(.2,h-inset*2-.5));
      }

      if(Math.min(w,h)>34){
        ctx.save();
        ctx.globalAlpha=.9*p.alpha;
        ctx.fillStyle="rgba(0,0,0,.80)";
        ctx.font='8px "IBM Plex Mono", monospace';
        ctx.textAlign="left";
        ctx.textBaseline="top";
        ctx.fillText(String(tile.txid||"").slice(0,8),x+4,y+3);
        ctx.fillText(`${Math.round(Number(tile.vbytes)||0)} vB`,x+4,y+14);
        const r=Number(tile.packageFeeRate??tile.feeRate);
        if(Number.isFinite(r))ctx.fillText(`${r.toFixed(1)} s/vB`,x+4,y+25);
        ctx.restore();
      }
    }

    ctx.globalAlpha=1;

    for(const [id,width,color] of [
      [selectedId,2,colors.selected||"#fff"],
      [hoverId,1,colors.border||"#e6a42b"]
    ]){
      if(!id)continue;
      const tile=layout.byId.get(id)||layout.byTxid.get(id);
      if(!tile)continue;
      const rect=tileRect(tile,inner,pad);
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.strokeRect(rect.x+.5,rect.y+.5,Math.max(1,rect.w-1),Math.max(1,rect.h-1));
    }

    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=1.5;
    ctx.strokeRect(1,1,css-2,css-2);
  }

  NS.Renderer=Object.freeze({
    __version:6,
    draw,
    previousMap,
    heatColor
  });
})();
