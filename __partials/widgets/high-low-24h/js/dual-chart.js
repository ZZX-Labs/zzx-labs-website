(function(){
  "use strict";

  const W=window;
  if(W.ZZXHighLow24HChart?.__version>=4)return;

  const finite=value=>{
    if(value==null||value==="")return NaN;
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  };

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function money(value){
    const number=finite(value);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function timeLabel(value){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return "—";
    return date.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
  }

  function fullTime(value){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleString():"time —";
  }

  class Chart{
    constructor(canvas,tooltip=null,{tooltipFormatter=null}={}){
      if(!(canvas instanceof HTMLCanvasElement))throw new Error("high-low canvas unavailable");
      this.canvas=canvas;
      this.ctx=canvas.getContext("2d");
      this.tooltip=tooltip||null;
      this.tooltipFormatter=typeof tooltipFormatter==="function"?tooltipFormatter:null;
      this.points=[];
      this.viewMode="range-price";
      this.followRight=true;
      this.zoom=1;
      this.pan=0;
      this.dragging=false;
      this.dragX=0;
      this.hoverIndex=-1;
      this.destroyed=false;
      this.abortController=typeof AbortController==="function"?new AbortController():null;
      const options=this.abortController?{signal:this.abortController.signal}:undefined;

      this.resizeObserver=typeof ResizeObserver==="function"
        ? new ResizeObserver(()=>this.resize())
        : null;
      this.resizeObserver?.observe(canvas);

      canvas.addEventListener("wheel",event=>this.onWheel(event),{...(options||{}),passive:false});
      canvas.addEventListener("pointerdown",event=>this.onPointerDown(event),options);
      canvas.addEventListener("pointermove",event=>this.onPointerMove(event),options);
      canvas.addEventListener("pointerup",event=>this.onPointerUp(event),options);
      canvas.addEventListener("pointercancel",event=>this.onPointerUp(event),options);
      canvas.addEventListener("pointerleave",()=>this.hideTooltip(),options);
      canvas.addEventListener("dblclick",()=>this.resetZoom(),options);
      this.resize();
    }

    destroy(){
      if(this.destroyed)return;
      this.destroyed=true;
      this.resizeObserver?.disconnect?.();
      this.abortController?.abort?.();
      this.hideTooltip();
    }

    resize(){
      if(this.destroyed)return;
      const rect=this.canvas.getBoundingClientRect();
      const dpr=Math.max(1,Math.min(3,W.devicePixelRatio||1));
      const width=Math.max(320,Math.round(rect.width||this.canvas.clientWidth||640));
      const height=Math.max(260,Math.round(rect.height||this.canvas.clientHeight||420));
      const pixelWidth=Math.round(width*dpr);
      const pixelHeight=Math.round(height*dpr);
      if(this.canvas.width!==pixelWidth)this.canvas.width=pixelWidth;
      if(this.canvas.height!==pixelHeight)this.canvas.height=pixelHeight;
      this.cssWidth=width;
      this.cssHeight=height;
      this.dpr=dpr;
      this.render();
    }

    setData(points,{viewMode="range-price",preserveView=true,followRight=true}={}){
      this.points=Array.isArray(points)?points.filter(Boolean):[];
      this.viewMode=["range-price","range-only","high-low-lines"].includes(viewMode)?viewMode:"range-price";
      this.followRight=followRight!==false;
      if(!preserveView){
        this.zoom=1;
        this.pan=0;
      }else if(this.followRight){
        this.pan=0;
      }
      this.render();
    }

    resetZoom(){
      this.zoom=1;
      this.pan=0;
      this.render();
    }

    visibleSlice(){
      const length=this.points.length;
      if(!length)return {rows:[],start:0,end:0};
      const visibleCount=clamp(Math.round(length/this.zoom),Math.min(length,24),length);
      const maxStart=Math.max(0,length-visibleCount);
      const end=clamp(length-Math.round(this.pan),visibleCount,length);
      const start=clamp(end-visibleCount,0,maxStart);
      return {rows:this.points.slice(start,end),start,end};
    }

    onWheel(event){
      if(!this.points.length)return;
      event.preventDefault();
      if(Math.abs(event.deltaX)>Math.abs(event.deltaY)||event.shiftKey){
        const step=Math.max(1,Math.round(this.points.length/35));
        this.pan=clamp(this.pan+((event.deltaX||event.deltaY)>0?step:-step),0,Math.max(0,this.points.length-24));
      }else{
        const factor=event.deltaY<0?1.16:1/1.16;
        this.zoom=clamp(this.zoom*factor,1,Math.max(1,this.points.length/24));
        if(this.followRight)this.pan=0;
      }
      this.render();
    }

    onPointerDown(event){
      if(event.button!==0)return;
      this.dragging=true;
      this.dragX=event.clientX;
      this.canvas.setPointerCapture?.(event.pointerId);
    }

    onPointerMove(event){
      if(this.dragging){
        const dx=event.clientX-this.dragX;
        this.dragX=event.clientX;
        const {rows}=this.visibleSlice();
        const plotWidth=Math.max(1,(this.cssWidth||640)-94);
        const perPoint=plotWidth/Math.max(1,rows.length-1);
        const delta=Math.round(-dx/Math.max(1,perPoint));
        if(delta){
          this.pan=clamp(this.pan+delta,0,Math.max(0,this.points.length-24));
          this.followRight=this.pan===0;
          this.render();
        }
        return;
      }
      this.showTooltip(event);
    }

    onPointerUp(event){
      this.dragging=false;
      try{this.canvas.releasePointerCapture?.(event.pointerId)}catch(_){}
    }

    showTooltip(event){
      if(!this.tooltip||!this.points.length)return;
      const {rows}=this.visibleSlice();
      if(!rows.length)return;
      const rect=this.canvas.getBoundingClientRect();
      const pad={l:68,r:26,t:28,b:34};
      const x=event.clientX-rect.left;
      const plotWidth=Math.max(1,rect.width-pad.l-pad.r);
      const ratio=clamp((x-pad.l)/plotWidth,0,1);
      const index=Math.round(ratio*Math.max(0,rows.length-1));
      const point=rows[index];
      if(!point)return;
      const rowsText=this.tooltipFormatter
        ? this.tooltipFormatter(point)
        : [fullTime(point.t),`high ${money(point.high)}`,`low ${money(point.low)}`,`close ${money(point.close??point.price)}`];
      this.tooltip.replaceChildren();
      rowsText.filter(Boolean).forEach((text,index)=>{
        const node=document.createElement(index===0?"strong":"span");
        node.textContent=String(text);
        this.tooltip.appendChild(node);
      });
      this.tooltip.hidden=false;
      const left=clamp(x+12,8,Math.max(8,rect.width-260));
      const y=event.clientY-rect.top;
      this.tooltip.style.left=`${left}px`;
      this.tooltip.style.top=`${clamp(y+12,8,Math.max(8,rect.height-150))}px`;
    }

    hideTooltip(){
      if(this.tooltip)this.tooltip.hidden=true;
    }

    exportPNG(filename="zzx-high-low-24h.png"){
      return new Promise((resolve,reject)=>{
        try{
          this.canvas.toBlob(blob=>{
            if(!blob){reject(new Error("PNG export failed"));return;}
            const url=URL.createObjectURL(blob);
            const link=document.createElement("a");
            link.href=url;
            link.download=filename;
            link.click();
            W.setTimeout(()=>URL.revokeObjectURL(url),1200);
            resolve(true);
          },"image/png");
        }catch(error){reject(error)}
      });
    }

    render(){
      if(this.destroyed||!this.ctx)return;
      const ctx=this.ctx;
      const width=this.cssWidth||640;
      const height=this.cssHeight||420;
      const dpr=this.dpr||1;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,width,height);
      ctx.fillStyle="#090c0b";
      ctx.fillRect(0,0,width,height);

      const {rows}=this.visibleSlice();
      if(rows.length<2)return;

      const pad={l:68,r:26,t:28,b:34};
      const plotWidth=Math.max(1,width-pad.l-pad.r);
      const plotHeight=Math.max(1,height-pad.t-pad.b);
      const highs=rows.map(row=>finite(row.high)).filter(Number.isFinite);
      const lows=rows.map(row=>finite(row.low)).filter(Number.isFinite);
      if(!highs.length||!lows.length)return;

      let yMin=Math.min(...lows);
      let yMax=Math.max(...highs);
      const span=Math.max(1,yMax-yMin);
      yMin-=span*.075;
      yMax+=span*.075;
      const ySpan=Math.max(1,yMax-yMin);
      const xFor=index=>pad.l+(index/Math.max(1,rows.length-1))*plotWidth;
      const yFor=value=>pad.t+(1-(value-yMin)/ySpan)*plotHeight;

      ctx.lineWidth=1;
      ctx.font='10px "IBM Plex Mono", monospace';
      ctx.textBaseline="middle";

      for(let index=0;index<=4;index+=1){
        const ratio=index/4;
        const y=pad.t+ratio*plotHeight;
        const value=yMax-ratio*ySpan;
        ctx.strokeStyle="rgba(192,214,116,.09)";
        ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke();
        ctx.fillStyle="#777";
        ctx.textAlign="right";
        ctx.fillText(money(value),pad.l-8,y);
      }

      for(let index=0;index<=4;index+=1){
        const pointIndex=Math.round(index/4*(rows.length-1));
        const point=rows[pointIndex];
        const x=xFor(pointIndex);
        ctx.strokeStyle="rgba(255,255,255,.035)";
        ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+plotHeight);ctx.stroke();
        ctx.fillStyle="#777";
        ctx.textAlign="center";
        ctx.fillText(timeLabel(point.t),x,height-14);
      }

      const upper=[];
      const lower=[];
      rows.forEach((row,index)=>{
        const high=finite(row.high);
        const low=finite(row.low);
        if(Number.isFinite(high)&&Number.isFinite(low)){
          upper.push({index,value:high});
          lower.push({index,value:low});
        }
      });

      if(this.viewMode!=="high-low-lines"&&upper.length>=2&&lower.length>=2){
        ctx.beginPath();
        upper.forEach((row,index)=>{
          const x=xFor(row.index),y=yFor(row.value);
          if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        });
        for(let index=lower.length-1;index>=0;index-=1){
          const row=lower[index];
          ctx.lineTo(xFor(row.index),yFor(row.value));
        }
        ctx.closePath();
        const gradient=ctx.createLinearGradient(0,pad.t,0,pad.t+plotHeight);
        gradient.addColorStop(0,"rgba(230,164,43,.13)");
        gradient.addColorStop(.5,"rgba(192,214,116,.055)");
        gradient.addColorStop(1,"rgba(214,116,116,.10)");
        ctx.fillStyle=gradient;
        ctx.fill();
      }

      const line=(metric,stroke,widthPx=1.25,dash=[])=>{
        ctx.beginPath();
        let started=false;
        rows.forEach((row,index)=>{
          const value=finite(row[metric]);
          if(!Number.isFinite(value)){started=false;return;}
          const x=xFor(index),y=yFor(value);
          if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);
        });
        ctx.strokeStyle=stroke;
        ctx.lineWidth=widthPx;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      line("high","#e6a42b",1.15);
      line("low","#d67474",1.15);
      if(this.viewMode!=="range-only")line("close","#c0d674",1.65);

      const current=finite(rows.at(-1)?.close??rows.at(-1)?.price);
      if(Number.isFinite(current)){
        const y=yFor(current);
        ctx.strokeStyle="rgba(192,214,116,.36)";
        ctx.setLineDash([4,4]);
        ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle="#c0d674";
        ctx.beginPath();ctx.arc(xFor(rows.length-1),y,2.8,0,Math.PI*2);ctx.fill();
        ctx.textAlign="right";
        ctx.fillStyle="#c0d674";
        ctx.fillText(money(current),width-pad.r,y-10);
      }

      ctx.textAlign="left";
      ctx.fillStyle="#777";
      ctx.fillText("USD",4,12);
    }
  }

  W.ZZXHighLow24HChart=Object.freeze({__version:4,Chart});
})();
