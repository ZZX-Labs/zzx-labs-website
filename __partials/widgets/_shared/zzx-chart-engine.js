(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXChartEngine?.__version>=12)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const DAY=86400000;

  function css(el,name,fallback){
    const v=getComputedStyle(el).getPropertyValue(name).trim();
    return v||fallback;
  }
  function compact(v,d=2){
    const n=finite(v); if(!Number.isFinite(n))return "—";
    const a=Math.abs(n);
    if(a>=1e12)return `${(n/1e12).toFixed(d)}T`;
    if(a>=1e9)return `${(n/1e9).toFixed(d)}B`;
    if(a>=1e6)return `${(n/1e6).toFixed(d)}M`;
    if(a>=1e3)return `${(n/1e3).toFixed(d)}K`;
    if(a>=1)return n.toFixed(d);
    return n.toPrecision(3);
  }
  function priceLabel(v){const n=finite(v);return Number.isFinite(n)?`$${compact(n,2)}`:"—"}
  function volumeLabel(v){const n=finite(v);return Number.isFinite(n)?`${compact(n,2)} BTC`:"—"}
  function timeLabel(ms,span){
    const d=new Date(ms);
    return span>36*3600000
      ? d.toLocaleDateString(undefined,{month:"short",day:"numeric"})
      : d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
  }
  function ts(p){
    const raw=p?.t??p?.ts_ms??p?.timestamp??p?.updated_at;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const n=new Date(raw).getTime();
    return Number.isFinite(n)?n:NaN;
  }
  function pointClose(p){
    return finite(p?.close??p?.price??p?.price_usd);
  }
  function normalise(points){
    const m=new Map();
    for(const raw of Array.isArray(points)?points:[]){
      if(!raw||typeof raw!=="object")continue;
      const t=ts(raw); if(!Number.isFinite(t))continue;
      m.set(t,{...raw,t});
    }
    return [...m.values()].sort((a,b)=>a.t-b.t);
  }
  function range(values,pad=.06,zero=false){
    const v=values.map(finite).filter(Number.isFinite);
    if(!v.length)return null;
    let min=Math.min(...v),max=Math.max(...v);
    if(zero)min=Math.min(0,min);
    if(min===max){
      const p=Math.max(Math.abs(min)*.01,1e-9);
      min-=p;max+=p;
    }
    const extra=(max-min)*pad;
    return {min:min-extra,max:max+extra};
  }
  function median(values){
    const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!v.length)return NaN;
    const i=Math.floor(v.length/2);
    return v.length%2?v[i]:(v[i-1]+v[i])/2;
  }

  class Chart{
    constructor(canvas,tooltip,options={}){
      if(!canvas)throw new Error("chart canvas unavailable");
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("2D canvas unavailable");
      this.canvas=canvas;this.ctx=ctx;this.tooltip=tooltip||null;
      this.options={...options};
      this.points=[];this.recipe={renderer:"line",metric:"price"};
      this.followRight=true;
      this.fullStart=0;this.fullEnd=1;this.viewStart=0;this.viewEnd=1;
      this.hoverIndex=-1;this.drag=null;this.destroyed=false;
      this.width=900;this.height=430;this.dpr=Math.max(1,W.devicePixelRatio||1);
      this.resizeObserver=null;
      this.bind();this.resize();
    }
    palette(){
      const el=this.canvas;
      return {
        bg:css(el,"--zzx-chart-bg","#090c0b"),
        panel:css(el,"--zzx-chart-panel","#0e1311"),
        grid:css(el,"--zzx-chart-grid","rgba(192,214,116,.12)"),
        text:css(el,"--zzx-chart-text","#aeb8a5"),
        muted:css(el,"--zzx-chart-muted","#6f7a6a"),
        primary:css(el,"--zzx-chart-primary","#c0d674"),
        accent:css(el,"--zzx-chart-accent","#e6a42b"),
        up:css(el,"--zzx-chart-up","#c0d674"),
        down:css(el,"--zzx-chart-down","#d67474"),
        range:css(el,"--zzx-chart-range","rgba(230,164,43,.14)"),
        cross:css(el,"--zzx-chart-cross","rgba(230,164,43,.45)")
      };
    }
    padding(){return {l:72,r:72,t:20,b:38}}
    bind(){
      this.onResize=()=>this.resize();
      this.onMove=e=>this.pointerMove(e);
      this.onLeave=()=>this.clearHover();
      this.onDown=e=>{
        if(e.button!==0)return;
        this.drag={x:e.clientX,start:this.viewStart,end:this.viewEnd};
        this.canvas.setPointerCapture?.(e.pointerId);
      };
      this.onUp=e=>{this.drag=null;this.canvas.releasePointerCapture?.(e.pointerId)};
      this.onWheel=e=>{
        e.preventDefault();
        if(this.points.length<2)return;
        const rect=this.canvas.getBoundingClientRect();
        const x=clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1);
        const span=this.viewEnd-this.viewStart;
        const factor=e.deltaY<0?.78:1.28;
        const minSpan=Math.max((this.fullEnd-this.fullStart)/200,5000);
        const newSpan=clamp(span*factor,minSpan,this.fullEnd-this.fullStart);
        const center=this.viewStart+x*span;
        let start=center-x*newSpan,end=start+newSpan;
        if(start<this.fullStart){end+=this.fullStart-start;start=this.fullStart}
        if(end>this.fullEnd){start-=end-this.fullEnd;end=this.fullEnd}
        this.viewStart=Math.max(this.fullStart,start);
        this.viewEnd=Math.min(this.fullEnd,end);
        this.followRight=Math.abs(this.viewEnd-this.fullEnd)<1000;
        this.draw();
      };
      this.onDbl=()=>this.resetZoom();
      this.onKey=e=>{
        if(!this.points.length)return;
        const span=this.viewEnd-this.viewStart;
        if(e.key==="+"||e.key==="="){e.preventDefault();this.zoom(.75)}
        else if(e.key==="-"){e.preventDefault();this.zoom(1.33)}
        else if(e.key==="0"||e.key==="Escape"){e.preventDefault();this.resetZoom()}
        else if(e.key==="ArrowLeft"){e.preventDefault();this.pan(-.12)}
        else if(e.key==="ArrowRight"){e.preventDefault();this.pan(.12)}
      };
      this.canvas.addEventListener("pointermove",this.onMove);
      this.canvas.addEventListener("pointerleave",this.onLeave);
      this.canvas.addEventListener("pointerdown",this.onDown);
      this.canvas.addEventListener("pointerup",this.onUp);
      this.canvas.addEventListener("pointercancel",this.onUp);
      this.canvas.addEventListener("wheel",this.onWheel,{passive:false});
      this.canvas.addEventListener("dblclick",this.onDbl);
      this.canvas.addEventListener("keydown",this.onKey);
      if("ResizeObserver" in W){
        this.resizeObserver=new ResizeObserver(this.onResize);
        this.resizeObserver.observe(this.canvas.parentElement||this.canvas);
      }else W.addEventListener("resize",this.onResize);
    }
    resize(){
      if(this.destroyed)return;
      const rect=this.canvas.getBoundingClientRect();
      const width=Math.max(320,Math.round(rect.width||this.canvas.parentElement?.clientWidth||900));
      const height=Math.max(300,Math.round(rect.height||430));
      const dpr=Math.max(1,W.devicePixelRatio||1);
      if(width===this.width&&height===this.height&&dpr===this.dpr)return this.draw();
      this.width=width;this.height=height;this.dpr=dpr;
      this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this.draw();
    }
    setData(points,recipe={},opts={}){
      const prevEnd=this.fullEnd;
      this.points=normalise(points);
      this.recipe={...recipe};
      this.followRight=opts.followRight!==false;
      if(this.points.length){
        this.fullStart=this.points[0].t;
        this.fullEnd=this.points[this.points.length-1].t;
        if(this.fullEnd<=this.fullStart)this.fullEnd=this.fullStart+1;
      }else{this.fullStart=0;this.fullEnd=1}
      const preserve=opts.preserveView===true&&prevEnd>0&&this.viewEnd>this.viewStart;
      if(!preserve){
        this.viewStart=this.fullStart;this.viewEnd=this.fullEnd;
      }else if(this.followRight){
        const span=Math.min(this.viewEnd-this.viewStart,this.fullEnd-this.fullStart);
        this.viewEnd=this.fullEnd;this.viewStart=Math.max(this.fullStart,this.fullEnd-span);
      }else{
        const span=Math.min(this.viewEnd-this.viewStart,this.fullEnd-this.fullStart);
        this.viewStart=clamp(this.viewStart,this.fullStart,Math.max(this.fullStart,this.fullEnd-span));
        this.viewEnd=Math.min(this.fullEnd,this.viewStart+span);
      }
      this.draw();
    }
    resetZoom(){
      this.viewStart=this.fullStart;this.viewEnd=this.fullEnd;this.followRight=true;this.draw();
    }
    zoom(factor){
      if(this.points.length<2)return;
      const span=this.viewEnd-this.viewStart,mid=(this.viewStart+this.viewEnd)/2;
      const next=clamp(span*factor,Math.max((this.fullEnd-this.fullStart)/200,5000),this.fullEnd-this.fullStart);
      this.viewStart=Math.max(this.fullStart,mid-next/2);
      this.viewEnd=Math.min(this.fullEnd,this.viewStart+next);
      if(this.viewEnd-this.viewStart<next)this.viewStart=Math.max(this.fullStart,this.viewEnd-next);
      this.followRight=Math.abs(this.viewEnd-this.fullEnd)<1000;this.draw();
    }
    pan(frac){
      const span=this.viewEnd-this.viewStart,shift=span*frac;
      let s=this.viewStart+shift,e=this.viewEnd+shift;
      if(s<this.fullStart){e+=this.fullStart-s;s=this.fullStart}
      if(e>this.fullEnd){s-=e-this.fullEnd;e=this.fullEnd}
      this.viewStart=Math.max(this.fullStart,s);this.viewEnd=Math.min(this.fullEnd,e);
      this.followRight=Math.abs(this.viewEnd-this.fullEnd)<1000;this.draw();
    }
    visible(){
      const out=this.points.filter(p=>p.t>=this.viewStart&&p.t<=this.viewEnd);
      if(out.length<2&&this.points.length)return this.points.slice(-Math.min(2,this.points.length));
      return out;
    }
    timeX(t,pad){
      const span=Math.max(1,this.viewEnd-this.viewStart);
      return pad.l+(t-this.viewStart)/span*(this.width-pad.l-pad.r);
    }
    y(v,r,top,bottom){
      return bottom-(finite(v)-r.min)/Math.max(1e-12,r.max-r.min)*(bottom-top);
    }
    gap(prev,p,nominal){
      if(!prev)return false;
      if(p?.gap_before===true)return true;
      const g=finite(p?.gap_ms);
      if(Number.isFinite(g)&&g>Math.max(15000,nominal*2.5))return true;
      return p.t-prev.t>Math.max(15000,nominal*2.5);
    }
    nominal(points){
      const ds=[];
      for(let i=1;i<points.length;i++){const d=points[i].t-points[i-1].t;if(d>0)ds.push(d)}
      return median(ds)||60000;
    }
    axes(ctx,pad,leftRange,rightRange,top,bottom,leftFmt,rightFmt){
      const P=this.palette(),plotW=this.width-pad.l-pad.r,span=this.viewEnd-this.viewStart;
      ctx.save();ctx.font="11px IBMPlexMono, monospace";ctx.lineWidth=1;
      for(let i=0;i<=4;i++){
        const f=i/4,y=top+(bottom-top)*f;
        ctx.strokeStyle=P.grid;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(this.width-pad.r,y);ctx.stroke();
        if(leftRange){
          const v=leftRange.max-f*(leftRange.max-leftRange.min);
          ctx.fillStyle=P.muted;ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillText(leftFmt(v),pad.l-8,y);
        }
        if(rightRange&&rightFmt){
          const v=rightRange.max-f*(rightRange.max-rightRange.min);
          ctx.fillStyle=P.muted;ctx.textAlign="left";ctx.fillText(rightFmt(v),this.width-pad.r+8,y);
        }
      }
      for(let i=0;i<=6;i++){
        const f=i/6,x=pad.l+plotW*f,t=this.viewStart+span*f;
        ctx.strokeStyle=P.grid;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
        ctx.fillStyle=P.muted;ctx.textAlign=i===0?"left":i===6?"right":"center";ctx.textBaseline="top";
        ctx.fillText(timeLabel(t,span),x,bottom+10);
      }
      ctx.restore();
    }
    line(ctx,pts,getValue,r,top,bottom,color,width=1.5,dash=[]){
      const pad=this.padding(),nominal=this.nominal(pts);
      ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.lineJoin="round";ctx.lineCap="round";
      let prev=null,started=false;
      for(const p of pts){
        const v=finite(getValue(p)); if(!Number.isFinite(v)){prev=p;started=false;continue}
        const x=this.timeX(p.t,pad),y=this.y(v,r,top,bottom);
        if(!started||this.gap(prev,p,nominal)){if(started)ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);started=true}
        else ctx.lineTo(x,y);
        prev=p;
      }
      if(started)ctx.stroke();ctx.restore();
    }
    area(ctx,pts,getValue,r,top,bottom,color){
      const pad=this.padding(),nominal=this.nominal(pts);
      const segments=[];let seg=[],prev=null;
      for(const p of pts){
        const v=finite(getValue(p));
        if(!Number.isFinite(v)){if(seg.length)segments.push(seg);seg=[];prev=p;continue}
        if(seg.length&&this.gap(prev,p,nominal)){segments.push(seg);seg=[]}
        seg.push({x:this.timeX(p.t,pad),y:this.y(v,r,top,bottom)});prev=p;
      }
      if(seg.length)segments.push(seg);
      ctx.save();
      for(const s of segments){
        if(s.length<2)continue;
        const g=ctx.createLinearGradient(0,top,0,bottom);
        g.addColorStop(0,"rgba(192,214,116,.22)");
        g.addColorStop(1,"rgba(192,214,116,0)");
        ctx.beginPath();ctx.moveTo(s[0].x,bottom);for(const q of s)ctx.lineTo(q.x,q.y);ctx.lineTo(s[s.length-1].x,bottom);ctx.closePath();
        ctx.fillStyle=g;ctx.fill();
      }
      ctx.restore();
    }
    candles(ctx,pts,r,top,bottom){
      const P=this.palette(),pad=this.padding(),plotW=this.width-pad.l-pad.r;
      const px=Math.max(1,plotW/Math.max(1,pts.length));
      const bw=clamp(px*.62,1.2,10);
      ctx.save();
      for(const p of pts){
        const o=finite(p.open??pointClose(p)),h=finite(p.high??pointClose(p)),l=finite(p.low??pointClose(p)),c=pointClose(p);
        if(![o,h,l,c].every(Number.isFinite))continue;
        const x=this.timeX(p.t,pad),yo=this.y(o,r,top,bottom),yh=this.y(h,r,top,bottom),yl=this.y(l,r,top,bottom),yc=this.y(c,r,top,bottom);
        const up=c>=o,color=up?P.up:P.down;
        ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
        const y=Math.min(yo,yc),ht=Math.max(1,Math.abs(yc-yo));
        ctx.globalAlpha=.78;ctx.fillRect(x-bw/2,y,bw,ht);ctx.globalAlpha=1;
      }
      ctx.restore();
      // always retain close-price line over candles
      this.line(ctx,pts,pointClose,r,top,bottom,P.accent,1.15,[]);
    }
    bars(ctx,pts,getValue,r,top,bottom){
      const P=this.palette(),pad=this.padding(),plotW=this.width-pad.l-pad.r;
      const px=Math.max(1,plotW/Math.max(1,pts.length)),bw=clamp(px*.7,1,10);
      const zero=this.y(Math.max(0,r.min),r,top,bottom);
      ctx.save();ctx.fillStyle=P.primary;ctx.globalAlpha=.52;
      for(const p of pts){
        const v=finite(getValue(p));if(!Number.isFinite(v))continue;
        const x=this.timeX(p.t,pad),y=this.y(v,r,top,bottom);
        ctx.fillRect(x-bw/2,Math.min(y,zero),bw,Math.max(1,Math.abs(zero-y)));
      }
      ctx.restore();
    }
    priceChart(ctx,pts,top,bottom){
      const P=this.palette();
      const vals=[];
      for(const p of pts){for(const v of [p.low,p.high,p.close,p.price,p.high_24h,p.low_24h]){const n=finite(v);if(Number.isFinite(n))vals.push(n)}}
      const r=range(vals,.05);if(!r)return null;
      this.axes(ctx,this.padding(),r,null,top,bottom,priceLabel,null);
      const renderer=this.recipe.renderer==="combo"
        ? (this.recipe.priceMode||"line")
        : (this.recipe.renderer||this.recipe.priceMode||"line");
      if(renderer==="area"){this.area(ctx,pts,pointClose,r,top,bottom,P.primary);this.line(ctx,pts,pointClose,r,top,bottom,P.primary,1.7)}
      else if(renderer==="candles")this.candles(ctx,pts,r,top,bottom);
      else if(renderer==="range"){
        this.rangeBand(ctx,pts,r,top,bottom);
        this.line(ctx,pts,p=>p.high_24h,r,top,bottom,P.primary,1.1,[5,4]);
        this.line(ctx,pts,p=>p.low_24h,r,top,bottom,P.down,1.1,[5,4]);
        this.line(ctx,pts,pointClose,r,top,bottom,P.accent,1.45);
      }else this.line(ctx,pts,pointClose,r,top,bottom,P.primary,1.7);
      if((this.recipe.showPriceHighLow||this.recipe.priceMode)&&renderer!=="range"){
        this.rangeBand(ctx,pts,r,top,bottom);
        this.line(ctx,pts,p=>p.high_24h,r,top,bottom,P.primary,.9,[4,4]);
        this.line(ctx,pts,p=>p.low_24h,r,top,bottom,P.down,.9,[4,4]);
      }
      for(const ref of this.recipe.referenceLines||[]){
        const v=finite(ref.value);if(!Number.isFinite(v))continue;
        const y=this.y(v,r,top,bottom);
        ctx.save();ctx.strokeStyle=ref.stroke||P.accent;ctx.setLineDash(ref.dash||[3,3]);ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(this.padding().l,y);ctx.lineTo(this.width-this.padding().r,y);ctx.stroke();ctx.restore();
      }
      for(const overlay of this.recipe.overlays||[]){
        if(!String(overlay.transform||"").startsWith("sma_")&&!String(overlay.transform||"").startsWith("ema_"))continue;
        const N=Number(String(overlay.transform).split("_")[1]||0);if(N<2)continue;
        const values=pts.map(pointClose);
        let ema=NaN;
        const derived=pts.map((p,i)=>{
          let v=NaN;
          if(String(overlay.transform).startsWith("sma")){
            const s=values.slice(Math.max(0,i-N+1),i+1).filter(Number.isFinite);if(s.length===N)v=s.reduce((a,b)=>a+b,0)/N;
          }else{
            const x=values[i];if(Number.isFinite(x)){ema=Number.isFinite(ema)?x*(2/(N+1))+ema*(1-2/(N+1)):x;v=ema}
          }
          return {...p,__overlay:v};
        });
        this.line(ctx,derived,p=>p.__overlay,r,top,bottom,overlay.stroke||P.accent,overlay.width||1,[...(overlay.dash||[])]);
      }
      return r;
    }
    rangeBand(ctx,pts,r,top,bottom){
      const pad=this.padding(),P=this.palette(),nominal=this.nominal(pts);
      const segments=[];let seg=[],prev=null;
      for(const p of pts){
        const hi=finite(p.high_24h),lo=finite(p.low_24h);
        if(!Number.isFinite(hi)||!Number.isFinite(lo)){if(seg.length)segments.push(seg);seg=[];prev=p;continue}
        if(seg.length&&this.gap(prev,p,nominal)){segments.push(seg);seg=[]}
        seg.push({x:this.timeX(p.t,pad),hi:this.y(hi,r,top,bottom),lo:this.y(lo,r,top,bottom)});prev=p;
      }
      if(seg.length)segments.push(seg);
      ctx.save();ctx.fillStyle=P.range;
      for(const s of segments){
        if(s.length<2)continue;ctx.beginPath();ctx.moveTo(s[0].x,s[0].hi);
        for(const q of s)ctx.lineTo(q.x,q.hi);
        for(let i=s.length-1;i>=0;i--)ctx.lineTo(s[i].x,s[i].lo);
        ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    volumeChart(ctx,pts,top,bottom,withTimeAxis=true){
      const P=this.palette();
      const mode=this.recipe.volumeMode
        ? this.recipe.volumeMode
        : this.recipe.id?.includes("interval-bars+rolling")
          ? "interval-bars+rolling"
          : this.recipe.id?.includes("interval-bars")
            ? "interval-bars"
            : "rolling-line";
      const rolling=pts.map(p=>finite(p.volume_24h_btc??p.volume_close_24h_btc)).filter(Number.isFinite);
      const interval=pts.map(p=>finite(p.interval_volume_btc)).filter(Number.isFinite);
      const rr=range(rolling,.08,true),ir=range(interval,.08,true);
      const useBars=mode!=="rolling-line",useRolling=mode!=="interval-bars";
      const left=useBars?ir:rr,right=useBars&&useRolling?rr:null;
      this.axes(ctx,this.padding(),left,right,top,bottom,useBars?volumeLabel:volumeLabel,right?volumeLabel:null);
      if(useBars&&ir)this.bars(ctx,pts,p=>p.interval_volume_btc,ir,top,bottom);
      if(useRolling&&rr)this.line(ctx,pts,p=>p.volume_24h_btc??p.volume_close_24h_btc,rr,top,bottom,P.accent,1.55);
      for(const ref of this.recipe.referenceLines||[]){
        const v=finite(ref.value);if(!Number.isFinite(v)||!left)continue;
        const y=this.y(v,left,top,bottom);ctx.save();ctx.strokeStyle=ref.stroke||P.accent;ctx.setLineDash(ref.dash||[4,4]);ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(this.padding().l,y);ctx.lineTo(this.width-this.padding().r,y);ctx.stroke();ctx.restore();
      }
      return {left,right};
    }
    draw(){
      if(this.destroyed)return;
      const ctx=this.ctx,P=this.palette(),pad=this.padding();
      ctx.clearRect(0,0,this.width,this.height);ctx.fillStyle=P.bg;ctx.fillRect(0,0,this.width,this.height);
      const pts=this.visible();
      if(!pts.length)return;
      const isCombo=this.recipe.kind==="combo"||this.recipe.renderer==="combo"||this.recipe.priceMode;
      if(isCombo&&this.recipe.volumeMode){
        const split=Math.round(this.height*.68),top=pad.t,priceBottom=split-12,volTop=split+12,volBottom=this.height-pad.b;
        ctx.fillStyle=P.panel;ctx.fillRect(pad.l,top,this.width-pad.l-pad.r,priceBottom-top);
        ctx.fillRect(pad.l,volTop,this.width-pad.l-pad.r,volBottom-volTop);
        this.priceChart(ctx,pts,top,priceBottom);
        this.volumeChart(ctx,pts,volTop,volBottom);
      }else if((this.recipe.metric||"").includes("volume")||String(this.recipe.id||"").startsWith("volume")){
        this.volumeChart(ctx,pts,pad.t,this.height-pad.b);
      }else{
        ctx.fillStyle=P.panel;ctx.fillRect(pad.l,pad.t,this.width-pad.l-pad.r,this.height-pad.t-pad.b);
        this.priceChart(ctx,pts,pad.t,this.height-pad.b);
      }
      this.drawHover(ctx,pts);
    }
    drawHover(ctx,pts){
      if(this.hoverIndex<0||this.hoverIndex>=this.points.length)return;
      const p=this.points[this.hoverIndex];if(p.t<this.viewStart||p.t>this.viewEnd)return;
      const pad=this.padding(),P=this.palette(),x=this.timeX(p.t,pad);
      ctx.save();ctx.strokeStyle=P.cross;ctx.setLineDash([3,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,this.height-pad.b);ctx.stroke();ctx.restore();
    }
    pointerMove(event){
      if(!this.points.length)return;
      const rect=this.canvas.getBoundingClientRect(),pad=this.padding();
      if(this.drag){
        const dx=event.clientX-this.drag.x;
        const plot=Math.max(1,rect.width-pad.l-pad.r),span=this.drag.end-this.drag.start;
        const shift=-dx/plot*span;
        let s=this.drag.start+shift,e=this.drag.end+shift;
        if(s<this.fullStart){e+=this.fullStart-s;s=this.fullStart}
        if(e>this.fullEnd){s-=e-this.fullEnd;e=this.fullEnd}
        this.viewStart=Math.max(this.fullStart,s);this.viewEnd=Math.min(this.fullEnd,e);this.followRight=false;this.draw();return;
      }
      const x=clamp(event.clientX-rect.left,pad.l,rect.width-pad.r);
      const t=this.viewStart+(x-pad.l)/Math.max(1,rect.width-pad.l-pad.r)*(this.viewEnd-this.viewStart);
      let lo=0,hi=this.points.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(this.points[mid].t<t)lo=mid+1;else hi=mid}
      let i=lo;if(i>0&&Math.abs(this.points[i-1].t-t)<Math.abs(this.points[i].t-t))i--;
      this.hoverIndex=i;this.showTooltip(this.points[i],event,rect);this.draw();
    }
    showTooltip(point,event,rect){
      if(!this.tooltip)return;
      const rows=this.options.tooltipFormatter?.(point);
      const values=Array.isArray(rows)?rows:[new Date(point.t).toLocaleString()];
      this.tooltip.replaceChildren();
      values.forEach((row,i)=>{const div=D.createElement(i===0?"strong":"span");div.textContent=String(row);this.tooltip.appendChild(div)});
      this.tooltip.hidden=false;
      const x=event.clientX-rect.left,y=event.clientY-rect.top;
      this.tooltip.style.left=`${clamp(x+14,8,Math.max(8,rect.width-230))}px`;
      this.tooltip.style.top=`${clamp(y+14,8,Math.max(8,rect.height-160))}px`;
    }
    clearHover(){this.hoverIndex=-1;if(this.tooltip)this.tooltip.hidden=true;this.draw()}
    async exportPNG(filename="zzx-chart.png"){
      const a=D.createElement("a");a.download=filename;a.href=this.canvas.toDataURL("image/png");a.click();
    }
    destroy(){
      this.destroyed=true;this.resizeObserver?.disconnect?.();W.removeEventListener("resize",this.onResize);
      this.canvas.removeEventListener("pointermove",this.onMove);this.canvas.removeEventListener("pointerleave",this.onLeave);
      this.canvas.removeEventListener("pointerdown",this.onDown);this.canvas.removeEventListener("pointerup",this.onUp);
      this.canvas.removeEventListener("pointercancel",this.onUp);this.canvas.removeEventListener("wheel",this.onWheel);
      this.canvas.removeEventListener("dblclick",this.onDbl);this.canvas.removeEventListener("keydown",this.onKey);
    }
  }

  W.ZZXChartEngine=Object.freeze({__version:12,Chart});
})();
