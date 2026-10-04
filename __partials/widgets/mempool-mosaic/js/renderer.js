(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicRenderer?.__version>=6)return;

  const stateByCanvas=new WeakMap();
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function cssPalette(canvas){
    const root=canvas?.closest?.(".mempool-mosaic");
    const s=root?getComputedStyle(root):null;
    const get=(name,fallback)=>String(s?.getPropertyValue(name)||"").trim()||fallback;
    return {low:get("--mg-low","#244052"),mid:get("--mg-mid","#4f8b67"),high:get("--mg-high","#c0d674"),hot:get("--mg-hot","#e6a42b"),green:get("--mg-green","#c0d674"),gold:get("--mg-gold","#e6a42b")};
  }

  function resize(canvas){
    const r=canvas.getBoundingClientRect();
    const css=Math.max(1,Math.floor(Math.min(r.width||520,r.height||r.width||520)));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const px=Math.max(1,Math.floor(css*dpr));
    if(canvas.width!==px||canvas.height!==px){canvas.width=px;canvas.height=px}
    const ctx=canvas.getContext("2d");if(!ctx)return null;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,css,dpr};
  }

  function quantiles(model){
    const rates=(model?.items||[]).map(r=>finite(r.packageFeeRate??r.feeRate)).filter(Number.isFinite).sort((a,b)=>a-b);
    const q=p=>rates.length?rates[Math.min(rates.length-1,Math.floor((rates.length-1)*p))]:NaN;
    return {q1:q(.25),q2:q(.5),q3:q(.75),q9:q(.92)};
  }

  function color(item,model,palette,qs){
    const r=finite(item?.packageFeeRate??item?.feeRate);
    if(!Number.isFinite(r))return palette.low;
    if(Number.isFinite(qs.q9)&&r>=qs.q9)return palette.hot;
    if(Number.isFinite(qs.q3)&&r>=qs.q3)return palette.high;
    if(Number.isFinite(qs.q1)&&r>=qs.q1)return palette.mid;
    return palette.low;
  }

  function paintLayout(surface,layout,model,{alpha=1,selectedTxid="",hoverTxid=""}={}){
    const {ctx,css}=surface,palette=cssPalette(ctx.canvas),qs=quantiles(model);
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
    for(const tile of layout?.leaves||[]){
      const x=tile.x*css,y=tile.y*css,s=tile.side*css;
      ctx.fillStyle=color(tile,model,palette,qs);ctx.fillRect(x,y,s,s);
      if(s>=5){ctx.strokeStyle="rgba(0,0,0,.22)";ctx.lineWidth=Math.min(.8,Math.max(.25,s*.02));ctx.strokeRect(x+.25,y+.25,Math.max(.1,s-.5),Math.max(.1,s-.5))}
      if(s>=28&&!tile.fragment){
        const value=finite(tile.valueSats);const rate=finite(tile.packageFeeRate??tile.feeRate);
        ctx.fillStyle="rgba(0,0,0,.56)";ctx.fillRect(x+1,y+1,Math.min(s-2,62),12);
        ctx.fillStyle="rgba(255,255,255,.82)";ctx.font="8px IBM Plex Mono, monospace";ctx.textBaseline="top";
        const text=Number.isFinite(value)?`${(value/1e8).toFixed(value>=1e8?2:4)} BTC`:Number.isFinite(rate)?`${rate.toFixed(1)} sat/vB`:String(tile.txid||"").slice(0,8);
        ctx.fillText(text,x+3,y+3);
      }
    }
    ctx.restore();

    for(const [id,width,col] of [[selectedTxid,2,palette.gold],[hoverTxid,1.2,"rgba(255,255,255,.85)"]]){
      if(!id)continue;const tiles=layout?.byTxid?.get?.(id)||[];
      for(const tile of tiles){const x=tile.x*css,y=tile.y*css,s=tile.side*css;ctx.save();ctx.strokeStyle=col;ctx.lineWidth=width;ctx.strokeRect(x+.5,y+.5,Math.max(1,s-1),Math.max(1,s-1));ctx.restore()}
    }
  }

  function movingOverlay(surface,fromLayout,toLayout,model,t){
    if(!fromLayout||!toLayout)return;
    const {ctx,css}=surface,palette=cssPalette(ctx.canvas),qs=quantiles(model);
    const fromPrimary=new Map();
    for(const tile of fromLayout.leaves||[]){if(tile.fragment||!tile.txid||fromPrimary.has(tile.txid))continue;fromPrimary.set(tile.txid,tile)}
    ctx.save();ctx.globalAlpha=.72*(1-Math.abs(.5-t)*.8);
    for(const tile of toLayout.leaves||[]){
      if(tile.fragment||!tile.txid)continue;const from=fromPrimary.get(tile.txid);if(!from)continue;
      const x=(from.x+(tile.x-from.x)*t)*css,y=(from.y+(tile.y-from.y)*t)*css,s=(from.side+(tile.side-from.side)*t)*css;
      if(s<4)continue;ctx.strokeStyle=color(tile,model,palette,qs);ctx.lineWidth=Math.min(2,Math.max(.6,s*.04));ctx.strokeRect(x+.5,y+.5,Math.max(1,s-1),Math.max(1,s-1));
    }
    ctx.restore();
  }

  function frame(surface,layout,model,opts,previous,t=1){
    const {ctx,css}=surface;ctx.clearRect(0,0,css,css);ctx.fillStyle="#0a0a0a";ctx.fillRect(0,0,css,css);
    if(previous&&t<1){paintLayout(surface,previous,model,{alpha:1});paintLayout(surface,layout,model,{alpha:.18+.82*t,selectedTxid:opts.selectedTxid,hoverTxid:opts.hoverTxid});movingOverlay(surface,previous,layout,model,t)}
    else paintLayout(surface,layout,model,{alpha:1,selectedTxid:opts.selectedTxid,hoverTxid:opts.hoverTxid});
  }

  function draw(canvas,layout,model,{animate=true,selectedTxid="",hoverTxid=""}={}){
    const surface=resize(canvas);if(!surface||!layout)return;
    let st=stateByCanvas.get(canvas);if(!st){st={layout:null,cancel:null};stateByCanvas.set(canvas,st)}
    st.cancel?.();st.cancel=null;
    const previous=st.layout;
    const opts={selectedTxid,hoverTxid};
    if(animate&&previous&&previous!==layout){
      const duration=Number(W.ZZXMempoolMosaicSources?.get?.(null)?.animationMs)||560;
      st.cancel=W.ZZXMempoolMosaicAnimation.run(duration,t=>frame(surface,layout,model,opts,previous,t),()=>{st.cancel=null;frame(surface,layout,model,opts,null,1)});
    }else frame(surface,layout,model,opts,null,1);
    st.layout=layout;
  }

  function hitTest(canvas,layout,clientX,clientY){
    const r=canvas.getBoundingClientRect();if(!(r.width>0&&r.height>0))return null;
    const nx=(clientX-r.left)/r.width,ny=(clientY-r.top)/r.height;
    return W.ZZXMempoolMosaicLayout.hit(layout,nx,ny);
  }
  function reset(canvas){const st=stateByCanvas.get(canvas);st?.cancel?.();stateByCanvas.delete(canvas)}

  W.ZZXMempoolMosaicRenderer=Object.freeze({__version:6,draw,hitTest,reset,color});
})();
