(function(){
  "use strict";
  const W=window;
  if(W.ZZXChartEngine?.__version>=1)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function movingAverage(values,period){
    const out=[],q=[];
    let sum=0;
    for(const v of values){
      const n=finite(v);
      q.push(n);sum+=Number.isFinite(n)?n:0;
      if(q.length>period){
        const old=q.shift();
        sum-=Number.isFinite(old)?old:0;
      }
      out.push(q.length===period?sum/period:NaN);
    }
    return out;
  }

  function ema(values,period){
    const out=[];
    const k=2/(period+1);
    let prev=NaN;
    for(const v of values){
      const n=finite(v);
      if(!Number.isFinite(n)){out.push(NaN);continue}
      prev=Number.isFinite(prev)?n*k+prev*(1-k):n;
      out.push(prev);
    }
    return out;
  }

  function stddev(values,period){
    const out=[];
    for(let i=0;i<values.length;i++){
      if(i+1<period){out.push(NaN);continue}
      const slice=values.slice(i-period+1,i+1).map(finite).filter(Number.isFinite);
      if(slice.length!==period){out.push(NaN);continue}
      const mean=slice.reduce((a,b)=>a+b,0)/slice.length;
      const variance=slice.reduce((a,b)=>a+(b-mean)*(b-mean),0)/slice.length;
      out.push(Math.sqrt(variance));
    }
    return out;
  }

  function zscore(values,period){
    const ma=movingAverage(values,period);
    const sd=stddev(values,period);
    return values.map((v,i)=>{
      const n=finite(v);
      return Number.isFinite(n)&&Number.isFinite(ma[i])&&sd[i]>0?(n-ma[i])/sd[i]:NaN;
    });
  }

  function transform(values,name){
    if(name==="raw")return values.map(finite);
    if(name==="sma_5")return movingAverage(values,5);
    if(name==="sma_20")return movingAverage(values,20);
    if(name==="ema_10")return ema(values,10);
    if(name==="ema_50")return ema(values,50);
    if(name==="zscore_20")return zscore(values,20);
    if(name==="volatility_20")return stddev(values.map((v,i)=>{
      if(i===0)return NaN;
      const a=finite(values[i-1]),b=finite(v);
      return a>0&&b>0?Math.log(b/a):NaN;
    }),20);

    if(name==="delta"){
      return values.map((v,i)=>i?finite(v)-finite(values[i-1]):NaN);
    }

    if(name==="pct_change"){
      return values.map((v,i)=>{
        if(!i)return NaN;
        const a=finite(values[i-1]),b=finite(v);
        return a!==0&&Number.isFinite(a)&&Number.isFinite(b)?(b-a)/a*100:NaN;
      });
    }

    if(name==="cumulative_return"){
      const first=values.map(finite).find(v=>Number.isFinite(v)&&v!==0);
      return values.map(v=>{
        const n=finite(v);
        return Number.isFinite(n)&&first?((n/first)-1)*100:NaN;
      });
    }

    if(name==="drawdown"){
      let peak=-Infinity;
      return values.map(v=>{
        const n=finite(v);
        if(!Number.isFinite(n))return NaN;
        peak=Math.max(peak,n);
        return peak>0?(n/peak-1)*100:NaN;
      });
    }

    return values.map(finite);
  }

  function metricValues(points,metric){
    if(metric==="ohlc")return points.map(p=>finite(p.close??p.price));
    return points.map(p=>finite(p?.[metric]));
  }

  function nice(n){
    const v=finite(n);
    if(!Number.isFinite(v))return "—";
    const a=Math.abs(v);
    if(a>=1e9)return (v/1e9).toFixed(2)+"B";
    if(a>=1e6)return (v/1e6).toFixed(2)+"M";
    if(a>=1e3)return (v/1e3).toFixed(2)+"K";
    if(a>=1)return v.toFixed(2);
    if(a>=1e-4)return v.toFixed(6);
    return v.toExponential(3);
  }

  class Chart {
    constructor(canvas,tooltip){
      this.canvas=canvas;
      this.ctx=canvas.getContext("2d");
      this.tooltip=tooltip||null;
      this.points=[];
      this.recipe={metric:"price",transform:"raw",renderer:"line"};
      this.viewStart=0;
      this.viewEnd=1;
      this.hoverIndex=-1;
      this.drag=null;
      this.dpr=Math.max(1,W.devicePixelRatio||1);
      this.bind();
      this.resize();
    }

    bind(){
      this._resize=()=>this.resize();
      W.addEventListener("resize",this._resize);

      this.canvas.addEventListener("pointermove",e=>this.pointerMove(e));
      this.canvas.addEventListener("pointerleave",()=>this.clearHover());
      this.canvas.addEventListener("pointerdown",e=>{
        this.drag={x:e.clientX,start:this.viewStart,end:this.viewEnd};
        this.canvas.setPointerCapture?.(e.pointerId);
      });
      this.canvas.addEventListener("pointerup",()=>{this.drag=null});
      this.canvas.addEventListener("wheel",e=>this.wheel(e),{passive:false});
      this.canvas.addEventListener("dblclick",()=>this.resetZoom());
    }

    destroy(){
      W.removeEventListener("resize",this._resize);
    }

    resize(){
      const rect=this.canvas.getBoundingClientRect();
      const w=Math.max(320,Math.floor(rect.width||this.canvas.parentElement?.clientWidth||800));
      const h=Math.max(220,Math.floor(rect.height||360));
      this.canvas.width=Math.floor(w*this.dpr);
      this.canvas.height=Math.floor(h*this.dpr);
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.width=w;this.height=h;
      this.draw();
    }

    setData(points,recipe){
      this.points=Array.isArray(points)?points:[];
      if(recipe)this.recipe=recipe;
      this.viewStart=0;
      this.viewEnd=1;
      this.hoverIndex=-1;
      this.draw();
    }

    resetZoom(){
      this.viewStart=0;this.viewEnd=1;this.draw();
    }

    visible(){
      if(!this.points.length)return [];
      const n=this.points.length;
      const a=Math.max(0,Math.floor(this.viewStart*(n-1)));
      const b=Math.min(n,Math.ceil(this.viewEnd*(n-1))+1);
      return this.points.slice(a,b).map((p,i)=>({...p,__index:a+i}));
    }

    wheel(e){
      if(this.points.length<3)return;
      e.preventDefault();
      const rect=this.canvas.getBoundingClientRect();
      const cursor=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
      const span=this.viewEnd-this.viewStart;
      const factor=e.deltaY>0?1.18:.82;
      let next=Math.max(.002,Math.min(1,span*factor));
      let start=this.viewStart+(span-next)*cursor;
      start=Math.max(0,Math.min(1-next,start));
      this.viewStart=start;this.viewEnd=start+next;
      this.draw();
    }

    pointerMove(e){
      const rect=this.canvas.getBoundingClientRect();

      if(this.drag){
        const dx=(e.clientX-this.drag.x)/rect.width;
        const span=this.drag.end-this.drag.start;
        let start=this.drag.start-dx*span;
        start=Math.max(0,Math.min(1-span,start));
        this.viewStart=start;this.viewEnd=start+span;
        this.draw();
        return;
      }

      const vis=this.visible();
      if(!vis.length)return;
      const x=Math.max(0,Math.min(rect.width,e.clientX-rect.left));
      const idx=Math.round(x/rect.width*(vis.length-1));
      this.hoverIndex=vis[idx]?.__index??-1;
      this.draw();
      this.showTooltip(e,vis[idx]);
    }

    clearHover(){
      this.hoverIndex=-1;
      if(this.tooltip)this.tooltip.hidden=true;
      this.draw();
    }

    showTooltip(e,p){
      if(!this.tooltip||!p)return;
      const t=Number(p.t);
      const date=Number.isFinite(t)?new Date(t):null;
      const rows=[
        date?date.toLocaleString():"time —",
        `price ${nice(p.price??p.close)}`,
        `open ${nice(p.open)} · high ${nice(p.high)} · low ${nice(p.low)} · close ${nice(p.close)}`,
        `volume ${nice(p.volume_24h_btc)} BTC`,
        `change ${nice(p.change)} · ${nice(p.change_pct)}%`,
      ];
      this.tooltip.replaceChildren();
      for(const row of rows){
        const div=document.createElement("div");
        div.textContent=row;
        this.tooltip.appendChild(div);
      }
      const host=this.canvas.parentElement.getBoundingClientRect();
      this.tooltip.style.left=Math.min(host.width-230,Math.max(8,e.clientX-host.left+12))+"px";
      this.tooltip.style.top=Math.max(8,e.clientY-host.top-72)+"px";
      this.tooltip.hidden=false;
    }

    draw(){
      const ctx=this.ctx,w=this.width||800,h=this.height||360;
      ctx.clearRect(0,0,w,h);

      const vis=this.visible();
      if(!vis.length){
        ctx.fillStyle="#777";
        ctx.font='12px "IBM Plex Mono", monospace';
        ctx.fillText("history unavailable",12,22);
        return;
      }

      const pad={l:58,r:16,t:14,b:34};
      const plotW=w-pad.l-pad.r,plotH=h-pad.t-pad.b;
      const recipe=this.recipe||{};
      const raw=metricValues(vis,recipe.metric||"price");
      const vals=transform(raw,recipe.transform||"raw");

      const valid=vals.filter(Number.isFinite);
      if(!valid.length)return;

      let min=Math.min(...valid),max=Math.max(...valid);
      if(recipe.renderer==="candles"||recipe.renderer==="ohlc"||recipe.renderer==="range"){
        const lows=vis.map(p=>finite(p.low)).filter(Number.isFinite);
        const highs=vis.map(p=>finite(p.high)).filter(Number.isFinite);
        if(lows.length)min=Math.min(min,...lows);
        if(highs.length)max=Math.max(max,...highs);
      }
      if(min===max){min-=1;max+=1}
      const margin=(max-min)*.06;
      min-=margin;max+=margin;

      const xFor=i=>pad.l+(vis.length<=1?0:i/(vis.length-1)*plotW);
      const yFor=v=>pad.t+(max-v)/(max-min)*plotH;

      ctx.strokeStyle="rgba(255,255,255,.08)";
      ctx.fillStyle="#6f7464";
      ctx.lineWidth=1;
      ctx.font='10px "IBM Plex Mono", monospace';

      for(let i=0;i<=4;i++){
        const y=pad.t+i/4*plotH;
        ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
        const val=max-(max-min)*i/4;
        ctx.fillText(nice(val),4,y+3);
      }

      const renderer=recipe.renderer||"line";
      const stroke="#c0d674";
      const accent="#e6a42b";

      const linePath=()=>{
        ctx.beginPath();
        let started=false;
        vals.forEach((v,i)=>{
          if(!Number.isFinite(v))return;
          const x=xFor(i),y=yFor(v);
          if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);
        });
      };

      if(renderer==="area"){
        linePath();
        ctx.strokeStyle=stroke;ctx.stroke();
        ctx.lineTo(xFor(vals.length-1),pad.t+plotH);
        ctx.lineTo(xFor(0),pad.t+plotH);
        ctx.closePath();
        ctx.fillStyle="rgba(192,214,116,.08)";ctx.fill();
      }else if(renderer==="step"){
        ctx.beginPath();
        let prev=null;
        vals.forEach((v,i)=>{
          if(!Number.isFinite(v))return;
          const x=xFor(i),y=yFor(v);
          if(prev===null)ctx.moveTo(x,y);
          else{ctx.lineTo(x,prev);ctx.lineTo(x,y)}
          prev=y;
        });
        ctx.strokeStyle=stroke;ctx.stroke();
      }else if(renderer==="bars"||renderer==="histogram"){
        const bw=Math.max(1,plotW/Math.max(1,vals.length)*.72);
        vals.forEach((v,i)=>{
          if(!Number.isFinite(v))return;
          const x=xFor(i)-bw/2;
          const zero=yFor(Math.max(min,Math.min(max,0)));
          const y=yFor(v);
          ctx.fillStyle=v>=0?"rgba(192,214,116,.65)":"rgba(214,116,116,.65)";
          ctx.fillRect(x,Math.min(y,zero),bw,Math.max(1,Math.abs(zero-y)));
        });
      }else if(renderer==="scatter"){
        ctx.fillStyle=stroke;
        vals.forEach((v,i)=>{
          if(!Number.isFinite(v))return;
          ctx.beginPath();ctx.arc(xFor(i),yFor(v),2,0,Math.PI*2);ctx.fill();
        });
      }else if(renderer==="baseline"){
        const zero=yFor(Math.max(min,Math.min(max,0)));
        ctx.strokeStyle=accent;ctx.beginPath();ctx.moveTo(pad.l,zero);ctx.lineTo(w-pad.r,zero);ctx.stroke();
        linePath();ctx.strokeStyle=stroke;ctx.stroke();
      }else if(renderer==="candles"||renderer==="ohlc"||renderer==="range"){
        const bw=Math.max(1,plotW/Math.max(1,vis.length)*.6);
        vis.forEach((p,i)=>{
          const o=finite(p.open),hi=finite(p.high),lo=finite(p.low),c=finite(p.close);
          if(![o,hi,lo,c].every(Number.isFinite))return;
          const x=xFor(i);
          ctx.strokeStyle=c>=o?stroke:"#d67474";
          ctx.fillStyle=c>=o?"rgba(192,214,116,.55)":"rgba(214,116,116,.55)";
          ctx.beginPath();ctx.moveTo(x,yFor(hi));ctx.lineTo(x,yFor(lo));ctx.stroke();

          if(renderer==="candles"){
            const y1=yFor(o),y2=yFor(c);
            ctx.fillRect(x-bw/2,Math.min(y1,y2),bw,Math.max(1,Math.abs(y2-y1)));
          }else if(renderer==="ohlc"){
            ctx.beginPath();
            ctx.moveTo(x-bw/2,yFor(o));ctx.lineTo(x,yFor(o));
            ctx.moveTo(x,yFor(c));ctx.lineTo(x+bw/2,yFor(c));
            ctx.stroke();
          }else{
            ctx.fillRect(x-bw/2,yFor(hi),bw,Math.max(1,yFor(lo)-yFor(hi)));
          }
        });
      }else{
        linePath();ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke();
      }

      if(this.hoverIndex>=0){
        const local=vis.findIndex(p=>p.__index===this.hoverIndex);
        if(local>=0){
          const x=xFor(local);
          ctx.strokeStyle="rgba(230,164,43,.75)";
          ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+plotH);ctx.stroke();
        }
      }

      const first=vis[0],last=vis[vis.length-1];
      ctx.fillStyle="#6f7464";
      ctx.fillText(new Date(first.t).toLocaleString(),pad.l,h-8);
      const right=new Date(last.t).toLocaleString();
      const tw=ctx.measureText(right).width;
      ctx.fillText(right,w-pad.r-tw,h-8);
    }
  }

  W.ZZXChartEngine=Object.freeze({
    __version:1,
    Chart,
    transform,
    movingAverage,
    ema,
    stddev,
    zscore,
    nice
  });
})();
