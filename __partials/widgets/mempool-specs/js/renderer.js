// __partials/widgets/mempool-specs/js/renderer.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});

  if(NS.Renderer?.__version>=5)return;

  function clamp(n,a,b){
    return Math.max(a,Math.min(b,n));
  }

  function size(canvas){
    const rect=canvas.getBoundingClientRect();
    const css=Math.max(
      220,
      Math.floor(
        Math.min(
          rect.width||520,
          rect.height||rect.width||520
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

  function previousMap(layout){
    if(!layout?.tiles)return null;

    const map=new Map();

    for(const tile of layout.tiles){
      map.set(tile.id,tile);
    }

    return map;
  }

  function interpolate(tile,fromMap,progress){
    const t=clamp(
      Number.isFinite(progress)?progress:1,
      0,
      1
    );

    const old=fromMap?.get(tile.id);

    if(!old||t>=1){
      return {
        x:tile.x,
        y:tile.y,
        w:tile.w,
        h:tile.h,
        alpha:old?1:t
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

  function hexToRgb(hex){
    const value=String(hex||"").replace("#","");

    if(!/^[0-9a-f]{6}$/i.test(value)){
      return null;
    }

    return {
      r:parseInt(value.slice(0,2),16),
      g:parseInt(value.slice(2,4),16),
      b:parseInt(value.slice(4,6),16)
    };
  }

  function mix(a,b,t){
    const A=hexToRgb(a);
    const B=hexToRgb(b);

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

    if(
      !Number.isFinite(value) ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max<=min
    ){
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

  function draw(canvas,layout,blockView,opts={}){
    if(!canvas||!layout||!blockView)return;

    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const {css,dpr}=size(canvas);

    ctx.setTransform(
      dpr,0,0,dpr,0,0
    );

    ctx.clearRect(
      0,0,css,css
    );

    const theme=NS.Theme?.get?.()||{};
    const colors=theme.colors||{};
    const background=colors.canvasBg||"#030303";

    ctx.fillStyle=background;
    ctx.fillRect(0,0,css,css);

    const pad=7;
    const inner=css-pad*2;

    const fromLayout=opts.fromLayout||null;
    const fromMap=opts.fromMap||previousMap(fromLayout);
    const progress=Number.isFinite(opts.progress)
      ? opts.progress
      : 1;

    const selectedId=opts.selectedId||"";
    const hoverId=opts.hoverId||"";

    for(const tile of layout.tiles){
      const p=interpolate(
        tile,
        fromMap,
        progress
      );

      const x=pad+p.x*inner;
      const y=pad+p.y*inner;
      const w=Math.max(.45,p.w*inner);
      const h=Math.max(.45,p.h*inner);

      const inset=Math.min(
        .75,
        Math.max(.18,Math.min(w,h)*.035)
      );

      ctx.globalAlpha=p.alpha;

      ctx.fillStyle=heatColor(
        tile.packageFeeRate??tile.feeRate,
        blockView,
        theme
      );

      ctx.fillRect(
        x+inset,
        y+inset,
        Math.max(.2,w-inset*2),
        Math.max(.2,h-inset*2)
      );

      if(tile.representative&&Math.min(w,h)>7){
        ctx.save();
        ctx.globalAlpha=.14*p.alpha;
        ctx.strokeStyle="#fff";
        ctx.lineWidth=.6;

        for(
          let line=-h;
          line<w+h;
          line+=7
        ){
          ctx.beginPath();
          ctx.moveTo(x+line,y+h);
          ctx.lineTo(x+line+h,y);
          ctx.stroke();
        }

        ctx.restore();
      }

      if(Math.min(w,h)>3){
        ctx.strokeStyle=colors.tileOutline||"rgba(255,255,255,.08)";
        ctx.lineWidth=.55;
        ctx.strokeRect(
          x+inset+.25,
          y+inset+.25,
          Math.max(.2,w-inset*2-.5),
          Math.max(.2,h-inset*2-.5)
        );
      }

      if(
        Math.min(w,h)>27 &&
        Number.isFinite(Number(tile.packageFeeRate??tile.feeRate))
      ){
        ctx.save();
        ctx.globalAlpha=.82*p.alpha;
        ctx.fillStyle="rgba(0,0,0,.78)";
        ctx.font='9px "IBM Plex Mono", monospace';
        ctx.textAlign="left";
        ctx.textBaseline="top";
        ctx.fillText(
          `${Number(tile.packageFeeRate??tile.feeRate).toFixed(1)}`,
          x+4,
          y+3
        );
        ctx.restore();
      }
    }

    ctx.globalAlpha=1;

    for(const [id,width,color] of [
      [selectedId,2,colors.selected||"#fff"],
      [hoverId,1,colors.border||"#e6a42b"]
    ]){
      if(!id)continue;

      const tile=layout.byId.get(id);
      if(!tile)continue;

      const rect=tileRect(
        tile,
        inner,
        pad
      );

      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.strokeRect(
        rect.x+.5,
        rect.y+.5,
        Math.max(1,rect.w-1),
        Math.max(1,rect.h-1)
      );
    }

    ctx.save();
    const grad=ctx.createLinearGradient(
      pad,
      pad,
      pad,
      css-pad
    );

    grad.addColorStop(
      0,
      "rgba(230,164,43,.18)"
    );

    grad.addColorStop(
      .16,
      "rgba(192,214,116,.05)"
    );

    grad.addColorStop(
      1,
      "rgba(0,0,0,.16)"
    );

    ctx.strokeStyle=grad;
    ctx.lineWidth=1;
    ctx.strokeRect(
      pad+.5,
      pad+.5,
      inner-1,
      inner-1
    );
    ctx.restore();

    ctx.strokeStyle=colors.border||"#e6a42b";
    ctx.lineWidth=1.5;
    ctx.strokeRect(
      1,
      1,
      css-2,
      css-2
    );
  }

  NS.Renderer=Object.freeze({
    __version:5,
    draw,
    previousMap,
    heatColor
  });
})();
