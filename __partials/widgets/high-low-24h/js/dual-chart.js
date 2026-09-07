(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.ZZXHighLow24HChart?.__version>=1)return;

  const finite=value=>{
    const number=Number(value);
    return Number.isFinite(number)
      ? number
      : NaN;
  };

  const clamp=(value,min,max)=>
    Math.max(
      min,
      Math.min(max,value)
    );

  function normalize(points){
    const byTime=new Map();

    for(
      const raw
      of Array.isArray(points)
        ? points
        : []
    ){
      const t=finite(raw?.t);

      if(
        !raw ||
        !Number.isFinite(t)
      ){
        continue;
      }

      byTime.set(
        t,
        {
          ...raw,
          t
        }
      );
    }

    return [
      ...byTime.values()
    ].sort(
      (a,b)=>a.t-b.t
    );
  }

  function compact(value){
    const number=finite(value);

    if(!Number.isFinite(number)){
      return "—";
    }

    const absolute=
      Math.abs(number);

    if(absolute>=1e9){
      return (
        `${(
          number/1e9
        ).toFixed(2)}B`
      );
    }

    if(absolute>=1e6){
      return (
        `${(
          number/1e6
        ).toFixed(2)}M`
      );
    }

    if(absolute>=1e3){
      return (
        `${(
          number/1e3
        ).toFixed(2)}K`
      );
    }

    if(absolute>=1){
      return number.toFixed(2);
    }

    return number.toFixed(4);
  }

  function priceLabel(value){
    const number=finite(value);

    return Number.isFinite(number)
      ? (
          "$"+
          compact(number)
        )
      : "—";
  }

  function volumeLabel(value){
    const number=finite(value);

    return Number.isFinite(number)
      ? (
          compact(number)+
          " BTC"
        )
      : "—";
  }

  function timeLabel(ms){
    const date=
      new Date(ms);

    return date.toLocaleTimeString(
      undefined,
      {
        hour:"2-digit",
        minute:"2-digit"
      }
    );
  }

  function scaleRange(values){
    const valid=
      values
        .map(finite)
        .filter(Number.isFinite);

    if(!valid.length){
      return null;
    }

    let min=
      Math.min(...valid);

    let max=
      Math.max(...valid);

    if(min===max){
      const pad=
        Math.max(
          1,
          Math.abs(min)*0.01
        );

      min-=pad;
      max+=pad;
    }

    const margin=
      (max-min)*0.065;

    return {
      min:min-margin,
      max:max+margin
    };
  }

  class Chart{
    constructor(
      canvas,
      tooltip,
      options={}
    ){
      if(!canvas){
        throw new Error(
          "high-low canvas unavailable"
        );
      }

      this.canvas=canvas;
      this.ctx=
        canvas.getContext("2d");

      if(!this.ctx){
        throw new Error(
          "2D canvas unavailable"
        );
      }

      this.tooltip=
        tooltip||null;

      this.options=
        {...options};

      this.points=[];
      this.recipe={
        priceMode:"area",
        volumeMode:"candles-line",
        showPriceLine:true,
        showPriceHighLow:true,
        showPriceRangeBand:true,
        showVolumeCandles:true,
        showVolumeLine:true
      };

      this.viewStart=0;
      this.viewEnd=1;
      this.hoverIndex=-1;
      this.drag=null;
      this.width=900;
      this.height=420;
      this.dpr=
        Math.max(
          1,
          W.devicePixelRatio||1
        );
      this._destroyed=false;
      this._resizeObserver=null;

      this.bind();
      this.resize();
    }

    padding(){
      return {
        l:78,
        r:84,
        t:22,
        b:42
      };
    }

    bind(){
      this._onResize=
        ()=>this.resize();

      this._onPointerMove=
        event=>
          this.pointerMove(event);

      this._onPointerLeave=
        ()=>this.clearHover();

      this._onPointerDown=
        event=>{
          this.drag={
            x:event.clientX,
            start:this.viewStart,
            end:this.viewEnd
          };

          this.canvas
            .setPointerCapture
            ?.(event.pointerId);
        };

      this._onPointerUp=
        event=>{
          this.drag=null;

          try{
            this.canvas
              .releasePointerCapture
              ?.(event.pointerId);
          }catch(_){}
        };

      this._onWheel=
        event=>
          this.wheel(event);

      this._onDblClick=
        ()=>this.resetZoom();

      this._onKeyDown=
        event=>
          this.keyDown(event);

      W.addEventListener(
        "resize",
        this._onResize
      );

      this.canvas.addEventListener(
        "pointermove",
        this._onPointerMove
      );

      this.canvas.addEventListener(
        "pointerleave",
        this._onPointerLeave
      );

      this.canvas.addEventListener(
        "pointerdown",
        this._onPointerDown
      );

      this.canvas.addEventListener(
        "pointerup",
        this._onPointerUp
      );

      this.canvas.addEventListener(
        "pointercancel",
        this._onPointerUp
      );

      this.canvas.addEventListener(
        "wheel",
        this._onWheel,
        {passive:false}
      );

      this.canvas.addEventListener(
        "dblclick",
        this._onDblClick
      );

      this.canvas.addEventListener(
        "keydown",
        this._onKeyDown
      );

      if(
        !this.canvas.hasAttribute(
          "tabindex"
        )
      ){
        this.canvas.tabIndex=0;
      }

      if(
        typeof ResizeObserver===
        "function"
      ){
        this._resizeObserver=
          new ResizeObserver(
            ()=>this.resize()
          );

        this._resizeObserver.observe(
          this.canvas.parentElement||
          this.canvas
        );
      }
    }

    destroy(){
      if(this._destroyed)return;

      this._destroyed=true;

      W.removeEventListener(
        "resize",
        this._onResize
      );

      for(
        const [name,handler]
        of [
          ["pointermove",this._onPointerMove],
          ["pointerleave",this._onPointerLeave],
          ["pointerdown",this._onPointerDown],
          ["pointerup",this._onPointerUp],
          ["pointercancel",this._onPointerUp],
          ["wheel",this._onWheel],
          ["dblclick",this._onDblClick],
          ["keydown",this._onKeyDown]
        ]
      ){
        this.canvas.removeEventListener(
          name,
          handler
        );
      }

      this._resizeObserver
        ?.disconnect?.();

      if(this.tooltip){
        this.tooltip.hidden=true;
      }
    }

    resize(){
      if(this._destroyed)return;

      const rect=
        this.canvas.getBoundingClientRect();

      const parentWidth=
        this.canvas.parentElement
          ?.clientWidth||
        900;

      const width=
        Math.max(
          280,
          Math.floor(
            rect.width||
            parentWidth||
            900
          )
        );

      const height=
        Math.max(
          240,
          Math.floor(
            rect.height||
            420
          )
        );

      this.dpr=
        Math.max(
          1,
          W.devicePixelRatio||1
        );

      this.canvas.width=
        Math.max(
          1,
          Math.floor(
            width*this.dpr
          )
        );

      this.canvas.height=
        Math.max(
          1,
          Math.floor(
            height*this.dpr
          )
        );

      this.ctx.setTransform(
        this.dpr,
        0,
        0,
        this.dpr,
        0,
        0
      );

      this.width=width;
      this.height=height;

      this.draw();
    }

    visible(){
      if(!this.points.length){
        return [];
      }

      const count=
        this.points.length;

      const start=
        Math.max(
          0,
          Math.floor(
            this.viewStart*
            (count-1)
          )
        );

      const end=
        Math.min(
          count,
          Math.ceil(
            this.viewEnd*
            (count-1)
          )+1
        );

      return this.points
        .slice(start,end)
        .map(
          (point,index)=>({
            ...point,
            __index:
              start+index
          })
        );
    }

    viewBounds(){
      const visible=
        this.visible();

      if(!visible.length){
        return null;
      }

      return {
        from:visible[0].t,
        to:visible.at(-1).t,
        full:
          this.viewStart<=0.000001 &&
          this.viewEnd>=0.999999,
        right:
          this.viewEnd>=0.999999
      };
    }

    restoreView(
      bounds,
      {followRight=false}={}
    ){
      if(
        !bounds ||
        !this.points.length
      ){
        this.viewStart=0;
        this.viewEnd=1;
        return;
      }

      if(bounds.full){
        this.viewStart=0;
        this.viewEnd=1;
        return;
      }

      const first=
        this.points[0].t;

      const last=
        this.points.at(-1).t;

      const total=
        Math.max(
          1,
          last-first
        );

      const span=
        Math.max(
          1,
          bounds.to-bounds.from
        );

      if(
        followRight &&
        bounds.right
      ){
        this.viewEnd=1;
        this.viewStart=
          clamp(
            1-span/total,
            0,
            1
          );
        return;
      }

      const start=
        clamp(
          (
            bounds.from-first
          )/
          total,
          0,
          1
        );

      const end=
        clamp(
          (
            bounds.to-first
          )/
          total,
          start+0.000001,
          1
        );

      this.viewStart=start;
      this.viewEnd=end;
    }

    setData(
      points,
      recipe,
      options={}
    ){
      const preserve=
        options.preserveView===
        true;

      const bounds=
        preserve
          ? this.viewBounds()
          : null;

      this.points=
        normalize(points);

      if(recipe){
        this.recipe={
          ...this.recipe,
          ...recipe
        };
      }

      if(preserve){
        this.restoreView(
          bounds,
          {
            followRight:
              options.followRight===
              true
          }
        );
      }else{
        this.viewStart=0;
        this.viewEnd=1;
      }

      this.hoverIndex=-1;

      if(this.tooltip){
        this.tooltip.hidden=true;
      }

      this.draw();
    }

    resetZoom(){
      this.viewStart=0;
      this.viewEnd=1;
      this.draw();
    }

    wheel(event){
      if(this.points.length<3){
        return;
      }

      event.preventDefault();

      const rect=
        this.canvas
          .getBoundingClientRect();

      const pad=
        this.padding();

      const plotWidth=
        Math.max(
          1,
          rect.width-
          pad.l-
          pad.r
        );

      const cursor=
        clamp(
          (
            event.clientX-
            rect.left-
            pad.l
          )/
          plotWidth,
          0,
          1
        );

      const span=
        this.viewEnd-
        this.viewStart;

      const factor=
        event.deltaY>0
          ? 1.18
          : 0.82;

      const next=
        clamp(
          span*factor,
          0.002,
          1
        );

      let start=
        this.viewStart+
        (
          span-next
        )*
        cursor;

      start=
        clamp(
          start,
          0,
          1-next
        );

      this.viewStart=start;
      this.viewEnd=
        start+next;

      this.draw();
    }

    panBy(fraction){
      const span=
        this.viewEnd-
        this.viewStart;

      if(span>=1)return;

      const delta=
        span*fraction;

      const start=
        clamp(
          this.viewStart+
          delta,
          0,
          1-span
        );

      this.viewStart=start;
      this.viewEnd=
        start+span;

      this.draw();
    }

    zoomAround(
      cursor,
      factor
    ){
      const span=
        this.viewEnd-
        this.viewStart;

      const next=
        clamp(
          span*factor,
          0.002,
          1
        );

      let start=
        this.viewStart+
        (
          span-next
        )*
        cursor;

      start=
        clamp(
          start,
          0,
          1-next
        );

      this.viewStart=start;
      this.viewEnd=
        start+next;

      this.draw();
    }

    keyDown(event){
      if(
        event.key==="Escape" ||
        event.key==="0"
      ){
        event.preventDefault();
        this.resetZoom();
        return;
      }

      if(
        event.key==="ArrowLeft"
      ){
        event.preventDefault();
        this.panBy(-0.12);
        return;
      }

      if(
        event.key==="ArrowRight"
      ){
        event.preventDefault();
        this.panBy(0.12);
        return;
      }

      if(
        event.key==="+" ||
        event.key==="="
      ){
        event.preventDefault();
        this.zoomAround(
          0.5,
          0.82
        );
        return;
      }

      if(
        event.key==="-" ||
        event.key==="_"
      ){
        event.preventDefault();
        this.zoomAround(
          0.5,
          1.18
        );
      }
    }

    pointerMove(event){
      const rect=
        this.canvas
          .getBoundingClientRect();

      if(this.drag){
        const dx=
          (
            event.clientX-
            this.drag.x
          )/
          Math.max(
            1,
            rect.width
          );

        const span=
          this.drag.end-
          this.drag.start;

        let start=
          this.drag.start-
          dx*span;

        start=
          clamp(
            start,
            0,
            1-span
          );

        this.viewStart=start;
        this.viewEnd=
          start+span;

        this.draw();
        return;
      }

      const visible=
        this.visible();

      if(!visible.length)return;

      const pad=
        this.padding();

      const plotWidth=
        Math.max(
          1,
          rect.width-
          pad.l-
          pad.r
        );

      const local=
        clamp(
          event.clientX-
          rect.left-
          pad.l,
          0,
          plotWidth
        );

      const index=
        Math.round(
          local/
          plotWidth*
          (visible.length-1)
        );

      const point=
        visible[index];

      this.hoverIndex=
        point?.__index ??
        -1;

      this.draw();
      this.showTooltip(
        event,
        point
      );
    }

    clearHover(){
      this.hoverIndex=-1;

      if(this.tooltip){
        this.tooltip.hidden=true;
      }

      this.draw();
    }

    showTooltip(
      event,
      point
    ){
      if(
        !this.tooltip ||
        !point
      ){
        return;
      }

      let rows=null;

      if(
        typeof this.options
          .tooltipFormatter===
        "function"
      ){
        try{
          rows=
            this.options
              .tooltipFormatter(
                point,
                this.recipe
              );
        }catch(_){
          rows=null;
        }
      }

      if(!Array.isArray(rows)){
        rows=[
          new Date(
            point.t
          ).toLocaleString(),
          `price ${priceLabel(point.price)}`,
          `24h H ${priceLabel(point.high_24h)} · L ${priceLabel(point.low_24h)}`,
          `volume ${volumeLabel(point.volume_24h_btc)}`
        ];
      }

      this.tooltip.replaceChildren();

      for(const row of rows){
        const element=
          D.createElement(
            "div"
          );

        element.textContent=
          String(row);

        this.tooltip
          .appendChild(
            element
          );
      }

      const host=
        this.canvas
          .parentElement
          .getBoundingClientRect();

      const width=
        Math.max(
          235,
          this.tooltip
            .offsetWidth||
          235
        );

      this.tooltip.style.left=
        (
          Math.min(
            Math.max(
              8,
              host.width-
              width-
              8
            ),
            Math.max(
              8,
              event.clientX-
              host.left+
              12
            )
          )
        )+
        "px";

      this.tooltip.style.top=
        (
          Math.max(
            8,
            event.clientY-
            host.top-
            100
          )
        )+
        "px";

      this.tooltip.hidden=false;
    }

    exportPNG(
      filename="high-low-24h.png"
    ){
      return new Promise(
        (resolve,reject)=>{
          if(
            !this.canvas?.toBlob
          ){
            reject(
              new Error(
                "canvas export unavailable"
              )
            );
            return;
          }

          this.canvas.toBlob(
            blob=>{
              if(!blob){
                reject(
                  new Error(
                    "canvas export failed"
                  )
                );
                return;
              }

              const href=
                URL.createObjectURL(
                  blob
                );

              const link=
                D.createElement(
                  "a"
                );

              link.href=href;
              link.download=
                filename;

              link.click();

              W.setTimeout(
                ()=>
                  URL.revokeObjectURL(
                    href
                  ),
                1000
              );

              resolve(blob);
            },
            "image/png"
          );
        }
      );
    }

    draw(){
      if(this._destroyed)return;

      const ctx=this.ctx;
      const width=this.width;
      const height=this.height;

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      const visible=
        this.visible();

      if(!visible.length){
        ctx.fillStyle="#777";
        ctx.font=
          '12px "IBM Plex Mono", monospace';
        ctx.fillText(
          "history unavailable",
          12,
          22
        );
        return;
      }

      const pad=
        this.padding();

      const plotWidth=
        Math.max(
          1,
          width-
          pad.l-
          pad.r
        );

      const plotHeight=
        Math.max(
          1,
          height-
          pad.t-
          pad.b
        );

      const priceValues=[];

      for(const row of visible){
        for(
          const value
          of [
            row.price,
            row.high_24h,
            row.low_24h
          ]
        ){
          if(
            Number.isFinite(
              finite(value)
            )
          ){
            priceValues.push(
              finite(value)
            );
          }
        }
      }

      const volumeValues=[];

      for(const row of visible){
        for(
          const value
          of [
            row.volume_open_24h_btc,
            row.volume_high_24h_btc,
            row.volume_low_24h_btc,
            row.volume_close_24h_btc
          ]
        ){
          if(
            Number.isFinite(
              finite(value)
            )
          ){
            volumeValues.push(
              finite(value)
            );
          }
        }
      }

      const priceRange=
        scaleRange(
          priceValues
        );

      const volumeRange=
        scaleRange(
          volumeValues
        );

      if(!priceRange){
        return;
      }

      const xFor=index=>
        pad.l+
        (
          visible.length<=1
            ? plotWidth/2
            : index/
              (visible.length-1)*
              plotWidth
        );

      const yPrice=value=>
        pad.t+
        (
          priceRange.max-
          value
        )/
        (
          priceRange.max-
          priceRange.min
        )*
        plotHeight;

      const yVolume=value=>
        !volumeRange
          ? (
              pad.t+
              plotHeight/2
            )
          : (
              pad.t+
              (
                volumeRange.max-
                value
              )/
              (
                volumeRange.max-
                volumeRange.min
              )*
              plotHeight
            );

      ctx.lineWidth=1;
      ctx.font=
        '10px "IBM Plex Mono", monospace';
      ctx.textBaseline=
        "alphabetic";

      // Horizontal grid and dual axis labels.
      for(
        let index=0;
        index<=4;
        index+=1
      ){
        const y=
          pad.t+
          index/4*
          plotHeight;

        ctx.strokeStyle=
          "rgba(255,255,255,.07)";

        ctx.beginPath();
        ctx.moveTo(
          pad.l,
          y
        );
        ctx.lineTo(
          width-pad.r,
          y
        );
        ctx.stroke();

        const p=
          priceRange.max-
          (
            priceRange.max-
            priceRange.min
          )*
          index/4;

        ctx.fillStyle=
          "#6f7464";

        ctx.fillText(
          priceLabel(p),
          4,
          y+3
        );

        if(volumeRange){
          const v=
            volumeRange.max-
            (
              volumeRange.max-
              volumeRange.min
            )*
            index/4;

          const label=
            volumeLabel(v);

          const tw=
            ctx.measureText(
              label
            ).width;

          ctx.fillStyle=
            "#8d8467";

          ctx.fillText(
            label,
            width-
            tw-
            4,
            y+3
          );
        }
      }

      // Axis identifiers.
      ctx.fillStyle="#c0d674";
      ctx.fillText(
        "USD PRICE",
        4,
        12
      );

      if(volumeRange){
        const label=
          "BTC VOLUME";

        const tw=
          ctx.measureText(
            label
          ).width;

        ctx.fillStyle="#e6a42b";
        ctx.fillText(
          label,
          width-tw-4,
          12
        );
      }

      // Time grid.
      const xTicks=
        Math.min(
          4,
          Math.max(
            1,
            visible.length-1
          )
        );

      for(
        let index=0;
        index<=xTicks;
        index+=1
      ){
        const pointIndex=
          Math.round(
            index/
            xTicks*
            (
              visible.length-1
            )
          );

        const point=
          visible[
            pointIndex
          ];

        if(!point)continue;

        const x=
          xFor(
            pointIndex
          );

        ctx.strokeStyle=
          "rgba(255,255,255,.035)";

        ctx.beginPath();
        ctx.moveTo(
          x,
          pad.t
        );
        ctx.lineTo(
          x,
          pad.t+
          plotHeight
        );
        ctx.stroke();

        const label=
          timeLabel(
            point.t
          );

        const tw=
          ctx.measureText(
            label
          ).width;

        ctx.fillStyle=
          "#6f7464";

        ctx.fillText(
          label,
          clamp(
            x-tw/2,
            pad.l,
            width-
            pad.r-
            tw
          ),
          height-10
        );
      }

      const linePath=(
        values,
        yFor,
        stroke,
        widthPx=1.5,
        dash=[]
      )=>{
        ctx.beginPath();

        let started=false;

        values.forEach(
          (value,index)=>{
            const number=
              finite(value);

            if(
              !Number.isFinite(
                number
              )
            ){
              started=false;
              return;
            }

            const x=
              xFor(index);

            const y=
              yFor(number);

            if(!started){
              ctx.moveTo(x,y);
              started=true;
            }else{
              ctx.lineTo(x,y);
            }
          }
        );

        ctx.strokeStyle=
          stroke;

        ctx.lineWidth=
          widthPx;

        ctx.setLineDash(
          dash
        );

        ctx.stroke();

        ctx.setLineDash([]);
      };

      const highSeries=
        visible.map(
          row=>
            finite(
              row.high_24h
            )
        );

      const lowSeries=
        visible.map(
          row=>
            finite(
              row.low_24h
            )
        );

      const priceSeries=
        visible.map(
          row=>
            finite(
              row.price
            )
        );

      // Price H/L range band.
      if(
        this.recipe
          .showPriceRangeBand
      ){
        const upper=[];
        const lower=[];

        for(
          let index=0;
          index<visible.length;
          index+=1
        ){
          const high=
            finite(
              visible[index]
                .high_24h
            );

          const low=
            finite(
              visible[index]
                .low_24h
            );

          if(
            Number.isFinite(high) &&
            Number.isFinite(low)
          ){
            upper.push({
              index,
              value:high
            });

            lower.push({
              index,
              value:low
            });
          }
        }

        if(
          upper.length>=2 &&
          lower.length>=2
        ){
          ctx.beginPath();

          upper.forEach(
            (row,index)=>{
              const x=
                xFor(row.index);

              const y=
                yPrice(row.value);

              if(index===0){
                ctx.moveTo(x,y);
              }else{
                ctx.lineTo(x,y);
              }
            }
          );

          for(
            let index=
              lower.length-1;
            index>=0;
            index-=1
          ){
            const row=
              lower[index];

            ctx.lineTo(
              xFor(row.index),
              yPrice(row.value)
            );
          }

          ctx.closePath();

          ctx.fillStyle=
            this.recipe
              .priceMode==="range"
              ? "rgba(192,214,116,.13)"
              : "rgba(192,214,116,.07)";

          ctx.fill();
        }
      }

      // Price area/line.
      if(
        this.recipe.priceMode===
        "area"
      ){
        const validIndexes=
          priceSeries
            .map(
              (value,index)=>({
                value,
                index
              })
            )
            .filter(
              row=>
                Number.isFinite(
                  row.value
                )
            );

        if(validIndexes.length){
          ctx.beginPath();

          validIndexes.forEach(
            (row,index)=>{
              const x=
                xFor(row.index);

              const y=
                yPrice(row.value);

              if(index===0){
                ctx.moveTo(x,y);
              }else{
                ctx.lineTo(x,y);
              }
            }
          );

          ctx.strokeStyle=
            "#c0d674";

          ctx.lineWidth=1.6;
          ctx.stroke();

          const first=
            validIndexes[0];

          const last=
            validIndexes.at(-1);

          ctx.lineTo(
            xFor(last.index),
            pad.t+
            plotHeight
          );

          ctx.lineTo(
            xFor(first.index),
            pad.t+
            plotHeight
          );

          ctx.closePath();

          const gradient=
            ctx.createLinearGradient(
              0,
              pad.t,
              0,
              pad.t+
              plotHeight
            );

          gradient.addColorStop(
            0,
            "rgba(192,214,116,.12)"
          );

          gradient.addColorStop(
            1,
            "rgba(192,214,116,.008)"
          );

          ctx.fillStyle=
            gradient;

          ctx.fill();
        }
      }else{
        linePath(
          priceSeries,
          yPrice,
          "#c0d674",
          this.recipe
            .priceMode==="range"
            ? 1.15
            : 1.65
        );
      }

      // Rolling price high and low lines.
      if(
        this.recipe
          .showPriceHighLow
      ){
        linePath(
          highSeries,
          yPrice,
          "#e6a42b",
          1.25,
          [5,3]
        );

        linePath(
          lowSeries,
          yPrice,
          "#d67474",
          1.25,
          [5,3]
        );
      }

      if(volumeRange){
        // Volume candles.
        if(
          this.recipe
            .showVolumeCandles
        ){
          const barWidth=
            Math.max(
              1,
              plotWidth/
              Math.max(
                1,
                visible.length
              )*
              0.58
            );

          visible.forEach(
            (point,index)=>{
              const open=
                finite(
                  point
                    .volume_open_24h_btc
                );

              const high=
                finite(
                  point
                    .volume_high_24h_btc
                );

              const low=
                finite(
                  point
                    .volume_low_24h_btc
                );

              const close=
                finite(
                  point
                    .volume_close_24h_btc
                );

              if(
                ![
                  open,
                  high,
                  low,
                  close
                ].every(
                  Number.isFinite
                )
              ){
                return;
              }

              const x=
                xFor(index);

              const rising=
                close>=open;

              ctx.strokeStyle=
                rising
                  ? "rgba(230,164,43,.78)"
                  : "rgba(214,116,116,.78)";

              ctx.fillStyle=
                rising
                  ? "rgba(230,164,43,.34)"
                  : "rgba(214,116,116,.34)";

              ctx.beginPath();

              ctx.moveTo(
                x,
                yVolume(high)
              );

              ctx.lineTo(
                x,
                yVolume(low)
              );

              ctx.stroke();

              const y1=
                yVolume(open);

              const y2=
                yVolume(close);

              ctx.fillRect(
                x-
                barWidth/2,
                Math.min(y1,y2),
                barWidth,
                Math.max(
                  1,
                  Math.abs(
                    y2-y1
                  )
                )
              );
            }
          );
        }

        // Closing rolling-volume line.
        if(
          this.recipe
            .showVolumeLine
        ){
          linePath(
            visible.map(
              row=>
                finite(
                  row
                    .volume_close_24h_btc
                )
            ),
            yVolume,
            "#e6a42b",
            1.45
          );
        }

        const observedVolumeHigh=
          Math.max(
            ...visible
              .map(
                row=>
                  finite(
                    row
                      .volume_high_24h_btc
                  )
              )
              .filter(
                Number.isFinite
              )
          );

        const observedVolumeLow=
          Math.min(
            ...visible
              .map(
                row=>
                  finite(
                    row
                      .volume_low_24h_btc
                  )
              )
              .filter(
                Number.isFinite
              )
          );

        for(
          const ref
          of [
            {
              value:observedVolumeHigh,
              label:"V H",
              stroke:
                "rgba(230,164,43,.58)"
            },
            {
              value:observedVolumeLow,
              label:"V L",
              stroke:
                "rgba(214,116,116,.56)"
            }
          ]
        ){
          if(
            !Number.isFinite(
              ref.value
            )
          ){
            continue;
          }

          const y=
            yVolume(
              ref.value
            );

          ctx.strokeStyle=
            ref.stroke;

          ctx.lineWidth=1;
          ctx.setLineDash(
            [4,4]
          );

          ctx.beginPath();

          ctx.moveTo(
            pad.l,
            y
          );

          ctx.lineTo(
            width-pad.r,
            y
          );

          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle=
            ref.stroke;

          ctx.fillText(
            ref.label,
            width-pad.r+5,
            Math.max(
              pad.t+10,
              y-3
            )
          );
        }
      }

      // Hover crosshair.
      if(this.hoverIndex>=0){
        const local=
          visible.findIndex(
            row=>
              row.__index===
              this.hoverIndex
          );

        if(local>=0){
          const x=
            xFor(local);

          ctx.strokeStyle=
            "rgba(255,255,255,.32)";

          ctx.lineWidth=1;

          ctx.beginPath();

          ctx.moveTo(
            x,
            pad.t
          );

          ctx.lineTo(
            x,
            pad.t+
            plotHeight
          );

          ctx.stroke();

          const price=
            finite(
              visible[local]
                .price
            );

          if(
            Number.isFinite(price)
          ){
            ctx.fillStyle=
              "#c0d674";

            ctx.beginPath();

            ctx.arc(
              x,
              yPrice(price),
              3,
              0,
              Math.PI*2
            );

            ctx.fill();
          }

          const volume=
            finite(
              visible[local]
                .volume_close_24h_btc
            );

          if(
            volumeRange &&
            Number.isFinite(volume)
          ){
            ctx.fillStyle=
              "#e6a42b";

            ctx.beginPath();

            ctx.arc(
              x,
              yVolume(volume),
              3,
              0,
              Math.PI*2
            );

            ctx.fill();
          }
        }
      }
    }
  }

  W.ZZXHighLow24HChart=
    Object.freeze({
      __version:1,
      Chart,
      normalize,
      compact,
      priceLabel,
      volumeLabel
    });
})();
