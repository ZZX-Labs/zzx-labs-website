(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.ZZXChartEngine?.__version>=2)return;

  const finite=value=>{
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  };

  function movingAverage(values,period){
    const out=[];
    const queue=[];
    let sum=0;
    let valid=0;

    for(const value of values){
      const number=finite(value);
      queue.push(number);

      if(Number.isFinite(number)){
        sum+=number;
        valid+=1;
      }

      if(queue.length>period){
        const old=queue.shift();
        if(Number.isFinite(old)){
          sum-=old;
          valid-=1;
        }
      }

      out.push(
        queue.length===period && valid===period
          ? sum/period
          : NaN
      );
    }

    return out;
  }

  function ema(values,period){
    const out=[];
    const alpha=2/(period+1);
    let previous=NaN;

    for(const value of values){
      const number=finite(value);

      if(!Number.isFinite(number)){
        out.push(NaN);
        continue;
      }

      previous=Number.isFinite(previous)
        ? number*alpha+previous*(1-alpha)
        : number;

      out.push(previous);
    }

    return out;
  }

  function stddev(values,period){
    const out=[];

    for(let index=0;index<values.length;index+=1){
      if(index+1<period){
        out.push(NaN);
        continue;
      }

      const sample=values
        .slice(index-period+1,index+1)
        .map(finite)
        .filter(Number.isFinite);

      if(sample.length!==period){
        out.push(NaN);
        continue;
      }

      const mean=sample.reduce((a,b)=>a+b,0)/sample.length;
      const variance=sample.reduce(
        (sum,value)=>sum+(value-mean)*(value-mean),
        0
      )/sample.length;

      out.push(Math.sqrt(variance));
    }

    return out;
  }

  function zscore(values,period){
    const mean=movingAverage(values,period);
    const deviation=stddev(values,period);

    return values.map((value,index)=>{
      const number=finite(value);

      return (
        Number.isFinite(number) &&
        Number.isFinite(mean[index]) &&
        deviation[index]>0
      )
        ? (number-mean[index])/deviation[index]
        : NaN;
    });
  }

  function transform(values,name){
    if(name==="raw")return values.map(finite);
    if(name==="sma_5")return movingAverage(values,5);
    if(name==="sma_20")return movingAverage(values,20);
    if(name==="ema_10")return ema(values,10);
    if(name==="ema_50")return ema(values,50);
    if(name==="zscore_20")return zscore(values,20);

    if(name==="volatility_20"){
      return stddev(
        values.map((value,index)=>{
          if(index===0)return NaN;
          const a=finite(values[index-1]);
          const b=finite(value);
          return a>0&&b>0?Math.log(b/a):NaN;
        }),
        20
      );
    }

    if(name==="delta"){
      return values.map((value,index)=>{
        if(index===0)return NaN;
        const a=finite(values[index-1]);
        const b=finite(value);
        return Number.isFinite(a)&&Number.isFinite(b)
          ? b-a
          : NaN;
      });
    }

    if(name==="pct_change"){
      return values.map((value,index)=>{
        if(index===0)return NaN;
        const a=finite(values[index-1]);
        const b=finite(value);
        return a!==0&&Number.isFinite(a)&&Number.isFinite(b)
          ? (b-a)/a*100
          : NaN;
      });
    }

    if(name==="cumulative_return"){
      const first=values
        .map(finite)
        .find(value=>Number.isFinite(value)&&value!==0);

      return values.map(value=>{
        const number=finite(value);
        return Number.isFinite(number)&&first
          ? (number/first-1)*100
          : NaN;
      });
    }

    if(name==="drawdown"){
      let peak=-Infinity;

      return values.map(value=>{
        const number=finite(value);
        if(!Number.isFinite(number))return NaN;
        peak=Math.max(peak,number);
        return peak>0?(number/peak-1)*100:NaN;
      });
    }

    return values.map(finite);
  }

  function metricValues(points,metric){
    if(metric==="ohlc"){
      return points.map(point=>finite(point?.close??point?.price));
    }

    return points.map(point=>finite(point?.[metric]));
  }

  function nice(value){
    const number=finite(value);
    if(!Number.isFinite(number))return "—";

    const absolute=Math.abs(number);
    if(absolute>=1e12)return (number/1e12).toFixed(2)+"T";
    if(absolute>=1e9)return (number/1e9).toFixed(2)+"B";
    if(absolute>=1e6)return (number/1e6).toFixed(2)+"M";
    if(absolute>=1e3)return (number/1e3).toFixed(2)+"K";
    if(absolute>=1)return number.toFixed(2);
    if(absolute>=1e-4)return number.toFixed(6);
    return number.toExponential(3);
  }

  function timestamp(point){
    const raw=point?.t??point?.ts_ms??point?.timestamp??point?.updated_at;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const parsed=new Date(raw).getTime();
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function normalizePoints(points){
    const byTime=new Map();

    for(const raw of Array.isArray(points)?points:[]){
      if(!raw||typeof raw!=="object")continue;
      const t=timestamp(raw);
      if(!Number.isFinite(t))continue;
      byTime.set(t,{...raw,t});
    }

    return [...byTime.values()].sort((a,b)=>a.t-b.t);
  }

  function formatTime(ms){
    const date=new Date(ms);
    return date.toLocaleTimeString(undefined,{
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  class Chart{
    constructor(canvas,tooltip,options={}){
      if(!canvas)throw new Error("chart canvas unavailable");

      this.canvas=canvas;
      this.ctx=canvas.getContext("2d");
      if(!this.ctx)throw new Error("2D canvas unavailable");

      this.tooltip=tooltip||null;
      this.options={...options};
      this.points=[];
      this.recipe={metric:"price",transform:"raw",renderer:"line"};
      this.viewStart=0;
      this.viewEnd=1;
      this.hoverIndex=-1;
      this.drag=null;
      this.dpr=Math.max(1,W.devicePixelRatio||1);
      this.width=800;
      this.height=360;
      this._destroyed=false;
      this._resizeObserver=null;

      this.bind();
      this.resize();
    }

    bind(){
      this._onResize=()=>this.resize();
      this._onPointerMove=event=>this.pointerMove(event);
      this._onPointerLeave=()=>this.clearHover();
      this._onPointerDown=event=>{
        this.drag={
          x:event.clientX,
          start:this.viewStart,
          end:this.viewEnd
        };
        this.canvas.setPointerCapture?.(event.pointerId);
      };
      this._onPointerUp=event=>{
        this.drag=null;
        try{this.canvas.releasePointerCapture?.(event.pointerId)}catch(_){}
      };
      this._onWheel=event=>this.wheel(event);
      this._onDblClick=()=>this.resetZoom();
      this._onKeyDown=event=>this.keyDown(event);

      W.addEventListener("resize",this._onResize);
      this.canvas.addEventListener("pointermove",this._onPointerMove);
      this.canvas.addEventListener("pointerleave",this._onPointerLeave);
      this.canvas.addEventListener("pointerdown",this._onPointerDown);
      this.canvas.addEventListener("pointerup",this._onPointerUp);
      this.canvas.addEventListener("pointercancel",this._onPointerUp);
      this.canvas.addEventListener("wheel",this._onWheel,{passive:false});
      this.canvas.addEventListener("dblclick",this._onDblClick);
      this.canvas.addEventListener("keydown",this._onKeyDown);

      if(!this.canvas.hasAttribute("tabindex")){
        this.canvas.tabIndex=0;
      }

      if(typeof ResizeObserver==="function"){
        this._resizeObserver=new ResizeObserver(()=>this.resize());
        this._resizeObserver.observe(this.canvas.parentElement||this.canvas);
      }
    }

    destroy(){
      if(this._destroyed)return;
      this._destroyed=true;

      W.removeEventListener("resize",this._onResize);
      this.canvas.removeEventListener("pointermove",this._onPointerMove);
      this.canvas.removeEventListener("pointerleave",this._onPointerLeave);
      this.canvas.removeEventListener("pointerdown",this._onPointerDown);
      this.canvas.removeEventListener("pointerup",this._onPointerUp);
      this.canvas.removeEventListener("pointercancel",this._onPointerUp);
      this.canvas.removeEventListener("wheel",this._onWheel);
      this.canvas.removeEventListener("dblclick",this._onDblClick);
      this.canvas.removeEventListener("keydown",this._onKeyDown);
      this._resizeObserver?.disconnect?.();

      if(this.tooltip)this.tooltip.hidden=true;
    }

    resize(){
      if(this._destroyed)return;

      const rect=this.canvas.getBoundingClientRect();
      const parentWidth=this.canvas.parentElement?.clientWidth||800;
      const width=Math.max(240,Math.floor(rect.width||parentWidth||800));
      const height=Math.max(180,Math.floor(rect.height||320));
      const nextDpr=Math.max(1,W.devicePixelRatio||1);

      this.dpr=nextDpr;
      this.canvas.width=Math.max(1,Math.floor(width*nextDpr));
      this.canvas.height=Math.max(1,Math.floor(height*nextDpr));
      this.ctx.setTransform(nextDpr,0,0,nextDpr,0,0);
      this.width=width;
      this.height=height;
      this.draw();
    }

    viewBounds(){
      if(!this.points.length)return null;
      const visible=this.visible();
      if(!visible.length)return null;
      return {
        from:visible[0].t,
        to:visible.at(-1).t,
        full:this.viewStart<=0.000001&&this.viewEnd>=0.999999,
        right:this.viewEnd>=0.999999
      };
    }

    restoreView(bounds,{followRight=false}={}){
      if(!bounds||!this.points.length){
        this.viewStart=0;
        this.viewEnd=1;
        return;
      }

      if(bounds.full){
        this.viewStart=0;
        this.viewEnd=1;
        return;
      }

      const first=this.points[0].t;
      const last=this.points.at(-1).t;
      const total=Math.max(1,last-first);
      const span=Math.max(1,bounds.to-bounds.from);

      if(followRight&&bounds.right){
        this.viewEnd=1;
        this.viewStart=clamp(1-span/total,0,1);
        return;
      }

      const start=clamp((bounds.from-first)/total,0,1);
      const end=clamp((bounds.to-first)/total,start+0.000001,1);
      this.viewStart=start;
      this.viewEnd=end;
    }

    setData(points,recipe,options={}){
      const preserve=options.preserveView===true;
      const bounds=preserve?this.viewBounds():null;

      this.points=normalizePoints(points);
      if(recipe)this.recipe=recipe;

      if(preserve){
        this.restoreView(bounds,{followRight:options.followRight===true});
      }else{
        this.viewStart=0;
        this.viewEnd=1;
      }

      this.hoverIndex=-1;
      if(this.tooltip)this.tooltip.hidden=true;
      this.draw();
    }

    setRecipe(recipe,{preserveView=true}={}){
      if(recipe)this.recipe=recipe;
      if(!preserveView){
        this.viewStart=0;
        this.viewEnd=1;
      }
      this.draw();
    }

    append(point,recipe=null,{maxPoints=20000,followRight=true}={}){
      const next=normalizePoints([...this.points,point]);
      const limited=next.length>maxPoints?next.slice(-maxPoints):next;
      this.setData(limited,recipe||this.recipe,{preserveView:true,followRight});
    }

    resetZoom(){
      this.viewStart=0;
      this.viewEnd=1;
      this.draw();
    }

    visible(){
      if(!this.points.length)return [];
      const count=this.points.length;
      const start=Math.max(0,Math.floor(this.viewStart*(count-1)));
      const end=Math.min(count,Math.ceil(this.viewEnd*(count-1))+1);

      return this.points
        .slice(start,end)
        .map((point,index)=>({...point,__index:start+index}));
    }

    wheel(event){
      if(this.points.length<3)return;
      event.preventDefault();

      const rect=this.canvas.getBoundingClientRect();
      const cursor=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
      const span=this.viewEnd-this.viewStart;
      const factor=event.deltaY>0?1.18:0.82;
      const next=clamp(span*factor,0.002,1);
      let start=this.viewStart+(span-next)*cursor;
      start=clamp(start,0,1-next);

      this.viewStart=start;
      this.viewEnd=start+next;
      this.draw();
    }

    panBy(fraction){
      const span=this.viewEnd-this.viewStart;
      if(span>=1)return;
      const delta=span*fraction;
      const start=clamp(this.viewStart+delta,0,1-span);
      this.viewStart=start;
      this.viewEnd=start+span;
      this.draw();
    }

    keyDown(event){
      if(event.key==="Escape"||event.key==="0"){
        event.preventDefault();
        this.resetZoom();
        return;
      }

      if(event.key==="ArrowLeft"){
        event.preventDefault();
        this.panBy(-0.12);
        return;
      }

      if(event.key==="ArrowRight"){
        event.preventDefault();
        this.panBy(0.12);
        return;
      }

      if(event.key==="+"||event.key==="="){
        event.preventDefault();
        this.zoomAround(0.5,0.82);
        return;
      }

      if(event.key==="-"||event.key==="_"){
        event.preventDefault();
        this.zoomAround(0.5,1.18);
      }
    }

    zoomAround(cursor,factor){
      const span=this.viewEnd-this.viewStart;
      const next=clamp(span*factor,0.002,1);
      let start=this.viewStart+(span-next)*cursor;
      start=clamp(start,0,1-next);
      this.viewStart=start;
      this.viewEnd=start+next;
      this.draw();
    }

    pointerMove(event){
      const rect=this.canvas.getBoundingClientRect();

      if(this.drag){
        const dx=(event.clientX-this.drag.x)/Math.max(1,rect.width);
        const span=this.drag.end-this.drag.start;
        let start=this.drag.start-dx*span;
        start=clamp(start,0,1-span);
        this.viewStart=start;
        this.viewEnd=start+span;
        this.draw();
        return;
      }

      const visible=this.visible();
      if(!visible.length)return;

      const plot={l:66,r:18};
      const plotWidth=Math.max(1,rect.width-plot.l-plot.r);
      const local=clamp(event.clientX-rect.left-plot.l,0,plotWidth);
      const index=Math.round(local/plotWidth*(visible.length-1));
      const point=visible[index];

      this.hoverIndex=point?.__index??-1;
      this.draw();
      this.showTooltip(event,point);
    }

    clearHover(){
      this.hoverIndex=-1;
      if(this.tooltip)this.tooltip.hidden=true;
      this.draw();
    }

    showTooltip(event,point){
      if(!this.tooltip||!point)return;

      const custom=this.options.tooltipFormatter;
      let rows=null;

      if(typeof custom==="function"){
        try{rows=custom(point,this.recipe)}catch(_){rows=null}
      }

      if(!Array.isArray(rows)){
        const t=finite(point.t);
        const date=Number.isFinite(t)?new Date(t):null;
        rows=[
          date?date.toLocaleString():"time —",
          `price ${nice(point.price??point.close)}`,
          `open ${nice(point.open)} · high ${nice(point.high)} · low ${nice(point.low)} · close ${nice(point.close)}`,
          `volume ${nice(point.volume_24h_btc)} BTC`,
          `change ${nice(point.change)} · ${nice(point.change_pct)}%`
        ];
      }

      this.tooltip.replaceChildren();

      for(const row of rows){
        const element=D.createElement("div");
        element.textContent=String(row);
        this.tooltip.appendChild(element);
      }

      const host=this.canvas.parentElement.getBoundingClientRect();
      const width=Math.max(210,this.tooltip.offsetWidth||210);
      this.tooltip.style.left=
        Math.min(
          Math.max(8,host.width-width-8),
          Math.max(8,event.clientX-host.left+12)
        )+"px";
      this.tooltip.style.top=
        Math.max(8,event.clientY-host.top-82)+"px";
      this.tooltip.hidden=false;
    }

    exportPNG(filename="chart.png"){
      return new Promise((resolve,reject)=>{
        if(!this.canvas?.toBlob){
          reject(new Error("canvas export unavailable"));
          return;
        }

        this.canvas.toBlob(blob=>{
          if(!blob){
            reject(new Error("canvas export failed"));
            return;
          }

          const href=URL.createObjectURL(blob);
          const link=D.createElement("a");
          link.href=href;
          link.download=filename;
          link.click();
          W.setTimeout(()=>URL.revokeObjectURL(href),1000);
          resolve(blob);
        },"image/png");
      });
    }

    draw(){
      if(this._destroyed)return;

      const ctx=this.ctx;
      const width=this.width||800;
      const height=this.height||360;
      ctx.clearRect(0,0,width,height);

      const visible=this.visible();

      if(!visible.length){
        ctx.fillStyle="#777";
        ctx.font='12px "IBM Plex Mono", monospace';
        ctx.fillText("history unavailable",12,22);
        return;
      }

      const pad={l:66,r:18,t:16,b:38};
      const plotWidth=Math.max(1,width-pad.l-pad.r);
      const plotHeight=Math.max(1,height-pad.t-pad.b);
      const recipe=this.recipe||{};
      const renderer=recipe.renderer||"line";
      const raw=metricValues(visible,recipe.metric||"price");
      const values=transform(raw,recipe.transform||"raw");
      const overlaySeries=(Array.isArray(recipe.overlays)?recipe.overlays:[])
        .map(overlay=>({
          ...overlay,
          values:transform(
            metricValues(visible,overlay.metric||recipe.metric||"price"),
            overlay.transform||"raw"
          )
        }));

      const valid=[
        ...values,
        ...overlaySeries.flatMap(series=>series.values),
        ...(Array.isArray(recipe.referenceLines)
          ? recipe.referenceLines.map(line=>finite(line?.value))
          : [])
      ].filter(Number.isFinite);

      if(renderer==="candles"||renderer==="ohlc"||renderer==="range"){
        valid.push(
          ...visible.map(point=>finite(point.low)).filter(Number.isFinite),
          ...visible.map(point=>finite(point.high)).filter(Number.isFinite)
        );
      }

      if(!valid.length)return;

      let minimum=Math.min(...valid);
      let maximum=Math.max(...valid);

      if(minimum===maximum){
        const padValue=Math.max(1,Math.abs(minimum)*0.01);
        minimum-=padValue;
        maximum+=padValue;
      }

      const margin=(maximum-minimum)*0.06;
      minimum-=margin;
      maximum+=margin;

      const xFor=index=>
        pad.l+
        (visible.length<=1
          ? plotWidth/2
          : index/(visible.length-1)*plotWidth);

      const yFor=value=>
        pad.t+(maximum-value)/(maximum-minimum)*plotHeight;

      ctx.lineWidth=1;
      ctx.font='10px "IBM Plex Mono", monospace';
      ctx.textBaseline="alphabetic";

      for(let index=0;index<=4;index+=1){
        const y=pad.t+index/4*plotHeight;
        const value=maximum-(maximum-minimum)*index/4;
        ctx.strokeStyle="rgba(255,255,255,.07)";
        ctx.beginPath();
        ctx.moveTo(pad.l,y);
        ctx.lineTo(width-pad.r,y);
        ctx.stroke();
        ctx.fillStyle="#6f7464";
        ctx.fillText(nice(value),4,y+3);
      }

      const xTicks=Math.min(4,Math.max(1,visible.length-1));
      for(let index=0;index<=xTicks;index+=1){
        const pointIndex=Math.round(index/xTicks*(visible.length-1));
        const point=visible[pointIndex];
        if(!point)continue;
        const x=xFor(pointIndex);
        ctx.strokeStyle="rgba(255,255,255,.035)";
        ctx.beginPath();
        ctx.moveTo(x,pad.t);
        ctx.lineTo(x,pad.t+plotHeight);
        ctx.stroke();
        const label=formatTime(point.t);
        const textWidth=ctx.measureText(label).width;
        ctx.fillStyle="#6f7464";
        ctx.fillText(
          label,
          clamp(x-textWidth/2,pad.l,width-pad.r-textWidth),
          height-10
        );
      }

      const primaryStroke=recipe.stroke||"#c0d674";
      const accent=recipe.accent||"#e6a42b";

      const linePath=(series,stroke=primaryStroke,widthPx=1.5,dash=[])=>{
        ctx.beginPath();
        let started=false;

        series.forEach((value,index)=>{
          if(!Number.isFinite(value))return;
          const x=xFor(index);
          const y=yFor(value);

          if(!started){
            ctx.moveTo(x,y);
            started=true;
          }else{
            ctx.lineTo(x,y);
          }
        });

        ctx.strokeStyle=stroke;
        ctx.lineWidth=widthPx;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      if(renderer==="area"){
        ctx.beginPath();
        let started=false;
        let firstIndex=-1;
        let lastIndex=-1;

        values.forEach((value,index)=>{
          if(!Number.isFinite(value))return;
          const x=xFor(index);
          const y=yFor(value);
          if(!started){
            ctx.moveTo(x,y);
            firstIndex=index;
            started=true;
          }else{
            ctx.lineTo(x,y);
          }
          lastIndex=index;
        });

        if(started){
          ctx.strokeStyle=primaryStroke;
          ctx.lineWidth=1.5;
          ctx.stroke();
          ctx.lineTo(xFor(lastIndex),pad.t+plotHeight);
          ctx.lineTo(xFor(firstIndex),pad.t+plotHeight);
          ctx.closePath();
          const gradient=ctx.createLinearGradient(0,pad.t,0,pad.t+plotHeight);
          gradient.addColorStop(0,"rgba(192,214,116,.18)");
          gradient.addColorStop(1,"rgba(192,214,116,.015)");
          ctx.fillStyle=gradient;
          ctx.fill();
        }
      }else if(renderer==="step"){
        ctx.beginPath();
        let previous=null;

        values.forEach((value,index)=>{
          if(!Number.isFinite(value))return;
          const x=xFor(index);
          const y=yFor(value);

          if(previous===null){
            ctx.moveTo(x,y);
          }else{
            ctx.lineTo(x,previous);
            ctx.lineTo(x,y);
          }
          previous=y;
        });

        ctx.strokeStyle=primaryStroke;
        ctx.lineWidth=1.5;
        ctx.stroke();
      }else if(renderer==="bars"||renderer==="histogram"){
        const barWidth=Math.max(1,plotWidth/Math.max(1,values.length)*0.72);
        values.forEach((value,index)=>{
          if(!Number.isFinite(value))return;
          const x=xFor(index)-barWidth/2;
          const zero=yFor(clamp(0,minimum,maximum));
          const y=yFor(value);
          ctx.fillStyle=value>=0
            ? "rgba(192,214,116,.65)"
            : "rgba(214,116,116,.65)";
          ctx.fillRect(x,Math.min(y,zero),barWidth,Math.max(1,Math.abs(zero-y)));
        });
      }else if(renderer==="scatter"){
        ctx.fillStyle=primaryStroke;
        values.forEach((value,index)=>{
          if(!Number.isFinite(value))return;
          ctx.beginPath();
          ctx.arc(xFor(index),yFor(value),2,0,Math.PI*2);
          ctx.fill();
        });
      }else if(renderer==="baseline"){
        const zero=yFor(clamp(0,minimum,maximum));
        ctx.strokeStyle=accent;
        ctx.beginPath();
        ctx.moveTo(pad.l,zero);
        ctx.lineTo(width-pad.r,zero);
        ctx.stroke();
        linePath(values);
      }else if(renderer==="candles"||renderer==="ohlc"||renderer==="range"){
        const barWidth=Math.max(1,plotWidth/Math.max(1,visible.length)*0.62);

        visible.forEach((point,index)=>{
          const open=finite(point.open);
          const high=finite(point.high);
          const low=finite(point.low);
          const close=finite(point.close);

          if(![open,high,low,close].every(Number.isFinite))return;

          const x=xFor(index);
          const positiveCandle=close>=open;
          ctx.strokeStyle=positiveCandle?primaryStroke:"#d67474";
          ctx.fillStyle=positiveCandle
            ? "rgba(192,214,116,.58)"
            : "rgba(214,116,116,.58)";
          ctx.beginPath();
          ctx.moveTo(x,yFor(high));
          ctx.lineTo(x,yFor(low));
          ctx.stroke();

          if(renderer==="candles"){
            const y1=yFor(open);
            const y2=yFor(close);
            ctx.fillRect(
              x-barWidth/2,
              Math.min(y1,y2),
              barWidth,
              Math.max(1,Math.abs(y2-y1))
            );
          }else if(renderer==="ohlc"){
            ctx.beginPath();
            ctx.moveTo(x-barWidth/2,yFor(open));
            ctx.lineTo(x,yFor(open));
            ctx.moveTo(x,yFor(close));
            ctx.lineTo(x+barWidth/2,yFor(close));
            ctx.stroke();
          }else{
            ctx.fillRect(
              x-barWidth/2,
              yFor(high),
              barWidth,
              Math.max(1,yFor(low)-yFor(high))
            );
          }
        });
      }else{
        linePath(values);
      }

      for(const overlay of overlaySeries){
        const stroke=overlay.stroke||accent;
        const widthPx=Number.isFinite(finite(overlay.width))?finite(overlay.width):1;
        const dash=Array.isArray(overlay.dash)?overlay.dash:[];
        linePath(overlay.values,stroke,widthPx,dash);
      }

      for(const line of Array.isArray(recipe.referenceLines)?recipe.referenceLines:[]){
        const value=finite(line?.value);
        if(!Number.isFinite(value))continue;
        const y=yFor(value);
        ctx.strokeStyle=line.stroke||"rgba(230,164,43,.62)";
        ctx.lineWidth=1;
        ctx.setLineDash(Array.isArray(line.dash)?line.dash:[4,4]);
        ctx.beginPath();
        ctx.moveTo(pad.l,y);
        ctx.lineTo(width-pad.r,y);
        ctx.stroke();
        ctx.setLineDash([]);

        if(line.label){
          ctx.fillStyle=line.stroke||"#e6a42b";
          const label=String(line.label);
          const tw=ctx.measureText(label).width;
          ctx.fillText(label,width-pad.r-tw-2,Math.max(pad.t+10,y-3));
        }
      }

      if(this.hoverIndex>=0){
        const local=visible.findIndex(point=>point.__index===this.hoverIndex);
        if(local>=0){
          const value=finite(values[local]);
          const x=xFor(local);
          ctx.strokeStyle="rgba(230,164,43,.72)";
          ctx.lineWidth=1;
          ctx.beginPath();
          ctx.moveTo(x,pad.t);
          ctx.lineTo(x,pad.t+plotHeight);
          ctx.stroke();

          if(Number.isFinite(value)){
            ctx.fillStyle=accent;
            ctx.beginPath();
            ctx.arc(x,yFor(value),3,0,Math.PI*2);
            ctx.fill();
          }
        }
      }
    }
  }

  W.ZZXChartEngine=Object.freeze({
    __version:2,
    Chart,
    transform,
    movingAverage,
    ema,
    stddev,
    zscore,
    nice,
    normalizePoints
  });
})();
