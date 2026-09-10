// __partials/widgets/hashrate-by-nation/js/charts.js
(function(){
  "use strict";

  const W=window;
  const D=document;

  if(Number(W.ZZXHashrateNationCharts?.__version||0)>=5)return;

  const NS="http://www.w3.org/2000/svg";
  const RANK_H=360;
  const TIME_H=250;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clamp(value,min,max){
    const n=finite(value);
    return Number.isFinite(n)
      ? Math.max(min,Math.min(max,n))
      : min;
  }

  function svg(tag,attrs={}){
    const el=D.createElementNS(NS,tag);

    for(const [key,value] of Object.entries(attrs)){
      if(value===null||value===undefined)continue;
      el.setAttribute(key,String(value));
    }

    return el;
  }

  function clear(el){
    if(el?.replaceChildren)el.replaceChildren();
  }

  function fmtEH(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";

    if(n>=1000){
      return `${(n/1000).toFixed(n>=10000?1:2)} ZH/s`;
    }

    if(n>=100)return `${n.toFixed(1)} EH/s`;
    if(n>=10)return `${n.toFixed(2)} EH/s`;
    return `${n.toFixed(3)} EH/s`;
  }

  function axisEH(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(n>=10000?1:2)} Z`;
    if(n>=100)return `${Math.round(n)} E`;
    if(n>=10)return `${n.toFixed(1)} E`;
    return `${n.toFixed(2)} E`;
  }

  function niceCeiling(value){
    const n=finite(value);
    if(!(n>0))return 1;

    const exponent=Math.floor(Math.log10(n));
    const power=10**exponent;
    const fraction=n/power;

    let nice;
    if(fraction<=1)nice=1;
    else if(fraction<=2)nice=2;
    else if(fraction<=2.5)nice=2.5;
    else if(fraction<=5)nice=5;
    else nice=10;

    return nice*power;
  }

  function countryLabel(row){
    const flag=String(row?.flag||"").trim();
    const name=String(row?.countryName||row?.country||"Unknown").trim();
    return `${flag?`${flag} `:""}${name}`;
  }

  function safeShare(row){
    return clamp(row?.share,0,1);
  }

  function normalizedRows(rows){
    const input=Array.isArray(rows)?rows:[];

    return input
      .map(row=>{
        const estimate=finite(row?.estimateEH);
        const low=finite(row?.lowEH);
        const high=finite(row?.highEH);

        if(!(estimate>=0))return null;

        const cleanLow=Number.isFinite(low)
          ? Math.max(0,Math.min(low,estimate))
          : estimate;

        const cleanHigh=Number.isFinite(high)
          ? Math.max(estimate,high)
          : estimate;

        return {
          row,
          estimateEH:estimate,
          lowEH:cleanLow,
          highEH:cleanHigh,
          share:safeShare(row)
        };
      })
      .filter(Boolean)
      .sort((a,b)=>
        b.estimateEH-a.estimateEH ||
        String(a.row?.countryName||"").localeCompare(
          String(b.row?.countryName||"")
        )
      );
  }

  function measuredViewBox(svgRoot,height,minWidth=360,maxWidth=1600){
    let width=640;

    try{
      const host=svgRoot?.parentElement||svgRoot;
      const rect=host?.getBoundingClientRect?.();

      if(rect?.width>0&&rect?.height>0){
        width=height*(rect.width/rect.height);
      }else if(rect?.width>0){
        width=rect.width;
      }
    }catch(_){}

    width=Math.round(clamp(width,minWidth,maxWidth));

    if(svgRoot){
      svgRoot.setAttribute("viewBox",`0 0 ${width} ${height}`);
      svgRoot.setAttribute("preserveAspectRatio","xMidYMid meet");
    }

    return width;
  }

  function rankGeometry(svgRoot,shown){
    const w=measuredViewBox(svgRoot,RANK_H,360,1600);

    const left=clamp(w*.19,104,150);
    const right=clamp(w*.13,72,126);
    const top=32;
    const bottom=24;
    const rowH=(RANK_H-top-bottom)/Math.max(10,shown.length);
    const plotW=Math.max(80,w-left-right);

    const observed=Math.max(
      0,
      ...shown.map(item=>item.highEH)
    );

    const max=niceCeiling(observed>0?observed:1);

    return {
      w,
      h:RANK_H,
      left,
      right,
      top,
      bottom,
      rowH,
      plotW,
      max,
      x:value=>left+(clamp(value,0,max)/max)*plotW
    };
  }

  function renderRank(root,rows){
    const svgRoot=root?.querySelector?.("[data-hbn-rank-svg]");
    const group=root?.querySelector?.("[data-hbn-rank-rows]");
    const grid=root?.querySelector?.("[data-hbn-rank-grid]");
    const empty=root?.querySelector?.("[data-hbn-rank-empty]");

    clear(group);
    clear(grid);

    const shown=normalizedRows(rows).slice(0,10);

    if(!svgRoot||!group||!grid||!shown.length){
      if(empty)empty.hidden=false;
      return {rows:0,maxEH:0};
    }

    if(empty)empty.hidden=true;

    const g=rankGeometry(svgRoot,shown);
    const ticks=4;

    for(let i=0;i<=ticks;i++){
      const fraction=i/ticks;
      const x=g.left+g.plotW*fraction;
      const value=g.max*fraction;

      grid.appendChild(svg("line",{
        x1:x,
        y1:g.top-14,
        x2:x,
        y2:g.h-g.bottom
      }));

      const label=svg("text",{
        x,
        y:16,
        "text-anchor":i===0?"start":i===ticks?"end":"middle"
      });

      label.textContent=axisEH(value);
      grid.appendChild(label);
    }

    shown.forEach((item,index)=>{
      const row=item.row;
      const center=g.top+(index+.5)*g.rowH;

      const label=svg("text",{
        x:g.left-9,
        y:center+3.5,
        "text-anchor":"end",
        class:"hbn-rank__label"
      });

      label.textContent=countryLabel(row);
      group.appendChild(label);

      const lowX=g.x(item.lowEH);
      const highX=g.x(item.highEH);
      const midX=g.x(item.estimateEH);

      group.appendChild(svg("rect",{
        x:lowX,
        y:center-7,
        width:Math.max(1,highX-lowX),
        height:14,
        rx:3,
        class:"hbn-rank__band"
      }));

      group.appendChild(svg("rect",{
        x:g.left,
        y:center-4,
        width:Math.max(1,midX-g.left),
        height:8,
        rx:2,
        class:"hbn-rank__bar"
      }));

      group.appendChild(svg("line",{
        x1:midX,
        y1:center-9,
        x2:midX,
        y2:center+9,
        class:"hbn-rank__mid"
      }));

      const value=svg("text",{
        x:g.w-8,
        y:center+3.5,
        "text-anchor":"end",
        class:"hbn-rank__value"
      });

      value.textContent=
        `${fmtEH(item.estimateEH)} · ${(item.share*100).toFixed(1)}%`;

      group.appendChild(value);
    });

    return {
      rows:shown.length,
      maxEH:g.max
    };
  }

  function normalizedHistory(model,topRows){
    const result=[];
    const timeline=Array.isArray(model?.timeline)?model.timeline:[];

    if(timeline.length){
      for(const point of timeline){
        const t=finite(point?.t);
        if(!Number.isFinite(t))continue;

        const nations={};

        for(const row of topRows){
          const country=String(row?.country||"");
          const value=finite(point?.nations?.[country]);

          if(Number.isFinite(value)&&value>=0){
            nations[country]=value;
          }
        }

        if(Object.keys(nations).length){
          result.push({
            t,
            globalEH:finite(point?.globalEH),
            nations
          });
        }
      }
    }

    if(!result.length){
      const history=Array.isArray(model?.history)?model.history:[];

      for(const point of history){
        const t=finite(point?.t);
        const eh=finite(point?.eh);

        if(!Number.isFinite(t)||!(eh>=0))continue;

        const nations={};

        for(const row of topRows){
          const country=String(row?.country||"");
          nations[country]=eh*safeShare(row);
        }

        result.push({
          t,
          globalEH:eh,
          nations
        });
      }
    }

    result.sort((a,b)=>a.t-b.t);

    const deduped=[];
    for(const point of result){
      if(deduped.length&&deduped.at(-1).t===point.t){
        deduped[deduped.length-1]=point;
      }else{
        deduped.push(point);
      }
    }

    return deduped;
  }

  function timelineGeometry(root,model){
    const topRows=normalizedRows(model?.rows)
      .slice(0,5)
      .map(item=>item.row);

    if(!topRows.length)return null;

    const history=normalizedHistory(model,topRows);
    if(history.length<2)return null;

    const svgRoot=root?.querySelector?.("[data-hbn-time-svg]");
    const w=measuredViewBox(svgRoot,TIME_H,360,1600);

    const left=clamp(w*.085,50,72);
    const right=clamp(w*.03,14,34);
    const top=16;
    const bottom=32;
    const plotW=Math.max(80,w-left-right);
    const plotH=TIME_H-top-bottom;

    const tMin=history[0].t;
    const tMax=history.at(-1).t;
    const tSpan=Math.max(1,tMax-tMin);

    let observed=0;

    for(const point of history){
      for(const row of topRows){
        const value=finite(point.nations?.[row.country]);
        if(Number.isFinite(value)&&value>=0){
          observed=Math.max(observed,value);
        }
      }
    }

    const max=niceCeiling(observed>0?observed*1.04:1);

    const x=t=>
      left+clamp((t-tMin)/tSpan,0,1)*plotW;

    const y=value=>
      top+(1-clamp(value,0,max)/max)*plotH;

    return {
      w,
      h:TIME_H,
      left,
      right,
      top,
      bottom,
      plotW,
      plotH,
      tMin,
      tMax,
      tSpan,
      max,
      x,
      y,
      topRows,
      history,
      svgRoot
    };
  }

  function timeTickLabel(t,span){
    const date=new Date(t);

    if(!Number.isFinite(date.getTime()))return "—";

    if(span<=36*60*60*1000){
      return date.toLocaleTimeString(undefined,{
        hour:"numeric",
        minute:"2-digit"
      });
    }

    if(span<=8*24*60*60*1000){
      return date.toLocaleDateString(undefined,{
        weekday:"short",
        hour:"numeric"
      });
    }

    return date.toLocaleDateString(undefined,{
      month:"short",
      day:"numeric"
    });
  }

  function renderTimelineAxes(root,g){
    const grid=root?.querySelector?.("[data-hbn-time-grid]");
    const yLabels=root?.querySelector?.("[data-hbn-time-y-labels]");
    const xLabels=root?.querySelector?.("[data-hbn-time-x-labels]");

    clear(grid);
    clear(yLabels);
    clear(xLabels);

    if(!grid||!yLabels||!xLabels)return;

    const yTicks=4;

    for(let i=0;i<=yTicks;i++){
      const fraction=i/yTicks;
      const y=g.top+fraction*g.plotH;
      const value=g.max*(1-fraction);

      grid.appendChild(svg("line",{
        x1:g.left,
        y1:y,
        x2:g.w-g.right,
        y2:y
      }));

      const label=svg("text",{
        x:g.left-7,
        y:y+3,
        "text-anchor":"end"
      });

      label.textContent=axisEH(value);
      yLabels.appendChild(label);
    }

    const xTicks=4;

    for(let i=0;i<=xTicks;i++){
      const fraction=i/xTicks;
      const t=g.tMin+fraction*g.tSpan;
      const x=g.x(t);

      const label=svg("text",{
        x,
        y:g.h-9,
        "text-anchor":i===0?"start":i===xTicks?"end":"middle"
      });

      label.textContent=timeTickLabel(t,g.tSpan);
      xLabels.appendChild(label);
    }
  }

  function pathFor(history,row,g){
    const country=String(row?.country||"");
    let path="";
    let drawing=false;

    for(const point of history){
      const value=finite(point?.nations?.[country]);

      if(!Number.isFinite(value)||value<0){
        drawing=false;
        continue;
      }

      const x=g.x(point.t);
      const y=g.y(value);

      path+=`${drawing?"L":"M"}${x.toFixed(2)},${y.toFixed(2)} `;
      drawing=true;
    }

    return path.trim();
  }

  function nearest(history,t){
    if(!history.length)return null;

    let lo=0;
    let hi=history.length-1;

    while(lo<hi){
      const mid=Math.floor((lo+hi)/2);

      if(history[mid].t<t){
        lo=mid+1;
      }else{
        hi=mid;
      }
    }

    const after=history[lo];
    const before=history[Math.max(0,lo-1)];

    return Math.abs(after.t-t)<Math.abs(before.t-t)
      ? after
      : before;
  }

  function clientToSvg(svgRoot,event,g){
    try{
      const point=svgRoot.createSVGPoint();
      point.x=event.clientX;
      point.y=event.clientY;

      const matrix=svgRoot.getScreenCTM();
      if(matrix?.inverse){
        const local=point.matrixTransform(matrix.inverse());

        return {
          x:clamp(local.x,0,g.w),
          y:clamp(local.y,0,g.h)
        };
      }
    }catch(_){}

    const rect=svgRoot.getBoundingClientRect();

    return {
      x:rect.width
        ? clamp((event.clientX-rect.left)/rect.width*g.w,0,g.w)
        : g.left,
      y:rect.height
        ? clamp((event.clientY-rect.top)/rect.height*g.h,0,g.h)
        : g.top
    };
  }

  function positionTooltip(svgRoot,tooltip,event){
    if(!tooltip)return;

    const host=svgRoot?.parentElement;
    const rect=host?.getBoundingClientRect?.();

    if(!rect?.width||!rect?.height){
      tooltip.style.left="50%";
      tooltip.style.top="70%";
      return;
    }

    const half=Math.min(115,Math.max(80,rect.width*.22));
    const left=clamp(event.clientX-rect.left,half,rect.width-half);
    const top=clamp(event.clientY-rect.top,72,rect.height-12);

    tooltip.style.left=`${left.toFixed(1)}px`;
    tooltip.style.top=`${top.toFixed(1)}px`;
  }

  function renderTimeline(root,model){
    const lines=root?.querySelector?.("[data-hbn-time-lines]");
    const empty=root?.querySelector?.("[data-hbn-time-empty]");
    const crosshair=root?.querySelector?.("[data-hbn-crosshair]");
    const tooltip=root?.querySelector?.("[data-hbn-tooltip]");
    const tipTime=root?.querySelector?.("[data-hbn-tip-time]");
    const tipRows=root?.querySelector?.("[data-hbn-tip-rows]");
    const svgRoot=root?.querySelector?.("[data-hbn-time-svg]");

    clear(lines);

    if(svgRoot){
      svgRoot.onpointermove=null;
      svgRoot.onpointerleave=null;
    }

    if(crosshair)crosshair.style.opacity="0";
    if(tooltip)tooltip.hidden=true;

    const g=timelineGeometry(root,model);

    if(!g||!lines||!svgRoot){
      if(empty)empty.hidden=false;
      clear(root?.querySelector?.("[data-hbn-time-grid]"));
      clear(root?.querySelector?.("[data-hbn-time-y-labels]"));
      clear(root?.querySelector?.("[data-hbn-time-x-labels]"));

      return {
        series:0,
        points:0,
        maxEH:0
      };
    }

    if(empty)empty.hidden=true;

    renderTimelineAxes(root,g);

    let series=0;

    for(const row of g.topRows){
      const d=pathFor(g.history,row,g);
      if(!d)continue;

      lines.appendChild(svg("path",{
        d,
        "data-country":row.country,
        "aria-label":countryLabel(row)
      }));

      series++;
    }

    if(!series){
      if(empty)empty.hidden=false;

      return {
        series:0,
        points:g.history.length,
        maxEH:g.max
      };
    }

    svgRoot.onpointermove=event=>{
      const local=clientToSvg(svgRoot,event,g);
      const fraction=clamp(
        (local.x-g.left)/g.plotW,
        0,
        1
      );

      const targetT=g.tMin+fraction*g.tSpan;
      const point=nearest(g.history,targetT);

      if(!point)return;

      const x=g.x(point.t);

      if(crosshair){
        crosshair.setAttribute("x1",x);
        crosshair.setAttribute("x2",x);
        crosshair.setAttribute("y1",g.top);
        crosshair.setAttribute("y2",g.h-g.bottom);
        crosshair.style.opacity="1";
      }

      if(tipTime){
        tipTime.textContent=new Date(point.t).toLocaleString();
      }

      if(tipRows){
        tipRows.replaceChildren();

        for(const row of g.topRows){
          const value=finite(point?.nations?.[row.country]);
          if(!Number.isFinite(value))continue;

          const line=D.createElement("div");
          line.className="hbn-tip__row";

          const name=D.createElement("span");
          name.textContent=countryLabel(row);

          const strong=D.createElement("strong");
          strong.textContent=fmtEH(value);

          line.append(name,strong);
          tipRows.appendChild(line);
        }
      }

      if(tooltip){
        tooltip.hidden=false;
        positionTooltip(svgRoot,tooltip,event);
      }
    };

    svgRoot.onpointerleave=()=>{
      if(crosshair)crosshair.style.opacity="0";
      if(tooltip)tooltip.hidden=true;
    };

    return {
      series,
      points:g.history.length,
      maxEH:g.max
    };
  }

  W.ZZXHashrateNationCharts=Object.freeze({
    __version:5,
    fmtEH,
    renderRank,
    renderTimeline
  });
})();
