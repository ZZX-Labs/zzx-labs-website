(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolGogglesRenderer?.__version>=2)return;

  const canvases=new WeakMap();

  function color(rate,median,max){
    const r=Number(rate),med=Number(median),hi=Number(max);
    if(!Number.isFinite(r))return "#244052";
    if(Number.isFinite(hi)&&r>=Math.max(150,hi*.72))return "#e6a42b";
    if(Number.isFinite(med)&&r>=Math.max(20,med*1.35))return "#c0d674";
    if(Number.isFinite(med)&&r>=Math.max(5,med*.72))return "#4f8b67";
    return "#244052";
  }

  function resize(canvas){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.floor(rect.width||520));
    const height=Math.max(1,Math.floor(rect.height||520));
    const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
    const pxW=Math.floor(width*dpr),pxH=Math.floor(height*dpr);
    if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
    const ctx=canvas.getContext("2d");if(!ctx)return null;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,width,height,dpr};
  }

  function ease(t){return 1-Math.pow(1-t,3);}
  function mix(a,b,t){return a+(b-a)*t;}
  function interpolate(a,b,t){return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),h:mix(a.h,b.h,t)};}

  function paint(surface,entries,stats,hits){
    const {ctx,width,height}=surface;
    ctx.clearRect(0,0,width,height);ctx.fillStyle="#0a0a0a";ctx.fillRect(0,0,width,height);
    hits.length=0;
    for(const entry of entries){
      const {item,rect,alpha}=entry;
      const gap=Math.min(1.25,Math.max(.18,Math.min(rect.w,rect.h)*.055));
      const x=rect.x+gap,y=rect.y+gap,w=Math.max(.25,rect.w-gap*2),h=Math.max(.25,rect.h-gap*2);
      ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
      ctx.fillStyle=color(item.feeRate,stats?.medianFee,stats?.feeMax);ctx.fillRect(x,y,w,h);
      if(w>9&&h>9){ctx.strokeStyle="rgba(255,255,255,.09)";ctx.lineWidth=.55;ctx.strokeRect(x+.3,y+.3,w-.6,h-.6);}
      if(item.kind==="transaction"&&w>28&&h>14){
        ctx.fillStyle="rgba(0,0,0,.5)";ctx.fillRect(x+1,y+1,Math.min(w-2,48),10);
        ctx.fillStyle="rgba(255,255,255,.75)";ctx.font="8px IBM Plex Mono, monospace";ctx.fillText(String(item.txid||"").slice(0,7),x+3,y+9);
      }
      if(alpha>.45)hits.push({x,y,w,h,item});
    }
    ctx.globalAlpha=1;ctx.strokeStyle="rgba(230,164,43,.65)";ctx.lineWidth=1;ctx.strokeRect(.5,.5,width-1,height-1);
  }

  function draw(canvas,tiles,stats,{animate=true}={}){
    const surface=resize(canvas);if(!surface)return [];
    let st=canvases.get(canvas);
    if(!st){st={rects:new Map(),items:new Map(),hits:[],raf:null};canvases.set(canvas,st);}
    if(st.raf)W.cancelAnimationFrame(st.raf);

    const pad=3;
    const targets=W.ZZXMempoolGogglesTreemap.layout(tiles,surface.width-pad*2,surface.height-pad*2)
      .map(row=>({item:row.item,rect:{x:pad+row.x,y:pad+row.y,w:row.w,h:row.h}}));
    const targetMap=new Map(targets.map(row=>[row.item.id,row.rect]));
    const targetItems=new Map(targets.map(row=>[row.item.id,row.item]));
    const fromMap=new Map(st.rects);
    const oldItems=new Map(st.items);
    const duration=Math.max(0,Number(W.ZZXMempoolGogglesSources?.animationMs)||420);
    const start=W.performance?.now?.()||Date.now();

    function spawn(target){return {x:target.x+target.w*.5,y:surface.height-2,w:Math.max(1,target.w*.08),h:1};}

    function frame(now){
      const raw=duration>0?Math.min(1,((now||Date.now())-start)/duration):1;
      const t=animate?ease(raw):1;
      const entries=[];
      for(const {item,rect:target} of targets){
        const from=fromMap.get(item.id)||spawn(target);
        entries.push({item,rect:interpolate(from,target,t),alpha:t});
      }
      for(const [id,from] of fromMap){
        if(targetMap.has(id))continue;
        const item=oldItems.get(id);if(!item)continue;
        const sink={x:from.x+from.w*.5,y:surface.height+4,w:1,h:1};
        entries.push({item,rect:interpolate(from,sink,t),alpha:1-t});
      }
      paint(surface,entries,stats,st.hits);
      if(raw<1){st.raf=W.requestAnimationFrame(frame);}else{st.raf=null;st.rects=targetMap;st.items=targetItems;}
    }

    frame(start);
    return st.hits;
  }

  function hitTest(hits,x,y){
    for(let i=(hits||[]).length-1;i>=0;i--){const r=hits[i];if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return r;}
    return null;
  }

  function reset(canvas){
    const st=canvases.get(canvas);if(st?.raf)W.cancelAnimationFrame(st.raf);canvases.delete(canvas);
  }

  W.ZZXMempoolGogglesRenderer=Object.freeze({__version:2,color,draw,hitTest,reset});
})();
