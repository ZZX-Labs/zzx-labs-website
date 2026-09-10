// __partials/widgets/hashrate-by-nation/js/charts.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXHashrateNationCharts?.__version||0)>=3)return;

  const NS="http://www.w3.org/2000/svg";

  function svg(tag,attrs={}){
    const el=D.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs)){
      el.setAttribute(key,String(value));
    }
    return el;
  }

  function clear(el){
    if(el)el.replaceChildren();
  }

  function fmtEH(value){
    const n=Number(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(2)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function renderRank(root,rows){
    const group=root.querySelector("[data-hbn-rank-rows]");
    const grid=root.querySelector("[data-hbn-rank-grid]");
    const empty=root.querySelector("[data-hbn-rank-empty]");

    clear(group);
    clear(grid);

    const shown=rows.slice(0,10);

    if(!shown.length){
      if(empty)empty.hidden=false;
      return {rows:0};
    }

    if(empty)empty.hidden=true;

    const WID=640;
    const H=360;
    const left=138;
    const right=78;
    const top=28;
    const rowH=30;
    const plotW=WID-left-right;

    const max=Math.max(
      ...shown.map(row=>row.highEH),
      1
    );

    for(let i=0;i<=4;i++){
      const x=left+(plotW*i/4);
      const value=max*i/4;

      grid.appendChild(svg("line",{
        x1:x,y1:top-12,x2:x,y2:H-18
      }));

      const label=svg("text",{
        x,
        y:14,
        "text-anchor":i===0?"start":i===4?"end":"middle"
      });
      label.textContent=fmtEH(value);
      grid.appendChild(label);
    }

    shown.forEach((row,index)=>{
      const y=top+index*rowH+8;
      const x=v=>left+(Math.max(0,v)/max)*plotW;

      const label=svg("text",{
        x:left-8,
        y:y+4,
        "text-anchor":"end",
        class:"hbn-rank__label"
      });
      label.textContent=`${row.flag} ${row.countryName}`;
      group.appendChild(label);

      const low=x(row.lowEH);
      const high=x(row.highEH);
      const mid=x(row.estimateEH);

      group.appendChild(svg("rect",{
        x:low,
        y:y-7,
        width:Math.max(1,high-low),
        height:14,
        rx:3,
        class:"hbn-rank__band"
      }));

      group.appendChild(svg("rect",{
        x:left,
        y:y-4,
        width:Math.max(1,mid-left),
        height:8,
        rx:2,
        class:"hbn-rank__bar"
      }));

      group.appendChild(svg("line",{
        x1:mid,y1:y-9,x2:mid,y2:y+9,
        class:"hbn-rank__mid"
      }));

      const value=svg("text",{
        x:WID-6,
        y:y+4,
        "text-anchor":"end",
        class:"hbn-rank__value"
      });
      value.textContent=`${fmtEH(row.estimateEH)} · ${(row.share*100).toFixed(1)}%`;
      group.appendChild(value);
    });

    return {rows:shown.length};
  }

  function timelineGeometry(model){
    const topRows=model.rows.slice(0,5);
    const history=model.history;

    if(history.length<2||!topRows.length)return null;

    const BOX={w:640,h:250,left:54,right:14,top:14,bottom:30};
    const tMin=history[0].t;
    const tMax=history.at(-1).t;
    const tSpan=Math.max(1,tMax-tMin);

    let max=0;
    for(const point of history){
      for(const row of topRows){
        max=Math.max(max,point.eh*row.share);
      }
    }

    max=Math.max(max,1)*1.08;

    const x=t=>BOX.left+((t-tMin)/tSpan)*(BOX.w-BOX.left-BOX.right);
    const y=v=>BOX.top+(1-v/max)*(BOX.h-BOX.top-BOX.bottom);

    return {BOX,tMin,tMax,max,x,y,topRows,history};
  }

  function renderTimelineAxes(root,g){
    const grid=root.querySelector("[data-hbn-time-grid]");
    const yLabels=root.querySelector("[data-hbn-time-y-labels]");
    const xLabels=root.querySelector("[data-hbn-time-x-labels]");

    clear(grid);
    clear(yLabels);
    clear(xLabels);

    for(let i=0;i<5;i++){
      const fraction=i/4;
      const y=g.BOX.top+fraction*(g.BOX.h-g.BOX.top-g.BOX.bottom);
      const value=g.max*(1-fraction);

      grid.appendChild(svg("line",{
        x1:g.BOX.left,y1:y,
        x2:g.BOX.w-g.BOX.right,y2:y
      }));

      const label=svg("text",{
        x:g.BOX.left-7,
        y:y+3,
        "text-anchor":"end"
      });
      label.textContent=value>=1000
        ? `${(value/1000).toFixed(2)}Z`
        : `${Math.round(value)}E`;
      yLabels.appendChild(label);
    }

    for(let i=0;i<4;i++){
      const fraction=i/3;
      const t=g.tMin+fraction*(g.tMax-g.tMin);
      const x=g.x(t);

      const label=svg("text",{
        x,
        y:g.BOX.h-8,
        "text-anchor":i===0?"start":i===3?"end":"middle"
      });

      label.textContent=new Date(t).toLocaleTimeString(undefined,{
        hour:"numeric",
        minute:"2-digit"
      });

      xLabels.appendChild(label);
    }
  }

  function pathFor(history,row,g){
    return history.map((point,index)=>{
      const x=g.x(point.t);
      const y=g.y(point.eh*row.share);
      return `${index?"L":"M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }

  function nearest(history,t){
    if(!history.length)return null;

    let best=history[0];
    let distance=Math.abs(best.t-t);

    for(let i=1;i<history.length;i++){
      const next=Math.abs(history[i].t-t);
      if(next<distance){
        best=history[i];
        distance=next;
      }
    }

    return best;
  }

  function renderTimeline(root,model){
    const lines=root.querySelector("[data-hbn-time-lines]");
    const empty=root.querySelector("[data-hbn-time-empty]");
    const crosshair=root.querySelector("[data-hbn-crosshair]");
    const tooltip=root.querySelector("[data-hbn-tooltip]");
    const tipTime=root.querySelector("[data-hbn-tip-time]");
    const tipRows=root.querySelector("[data-hbn-tip-rows]");
    const svgRoot=root.querySelector("[data-hbn-time-svg]");

    clear(lines);

    if(crosshair)crosshair.style.opacity="0";
    if(tooltip)tooltip.hidden=true;

    const g=timelineGeometry(model);

    if(!g){
      if(empty)empty.hidden=false;
      clear(root.querySelector("[data-hbn-time-grid]"));
      clear(root.querySelector("[data-hbn-time-y-labels]"));
      clear(root.querySelector("[data-hbn-time-x-labels]"));
      return {series:0,points:0};
    }

    if(empty)empty.hidden=true;
    renderTimelineAxes(root,g);

    for(const row of g.topRows){
      lines.appendChild(svg("path",{
        d:pathFor(g.history,row,g),
        "data-country":row.country
      }));
    }

    if(svgRoot){
      svgRoot.onpointermove=event=>{
        const rect=svgRoot.getBoundingClientRect();
        if(!rect.width)return;

        const px=(event.clientX-rect.left)/rect.width*g.BOX.w;
        const plotFraction=Math.max(
          0,
          Math.min(
            1,
            (px-g.BOX.left)/(g.BOX.w-g.BOX.left-g.BOX.right)
          )
        );

        const t=g.tMin+plotFraction*(g.tMax-g.tMin);
        const point=nearest(g.history,t);
        if(!point)return;

        const x=g.x(point.t);

        crosshair.setAttribute("x1",x);
        crosshair.setAttribute("x2",x);
        crosshair.setAttribute("y1",g.BOX.top);
        crosshair.setAttribute("y2",g.BOX.h-g.BOX.bottom);
        crosshair.style.opacity="1";

        tipTime.textContent=new Date(point.t).toLocaleString();
        tipRows.replaceChildren();

        for(const row of g.topRows){
          const line=D.createElement("div");
          line.className="hbn-tip__row";

          const name=D.createElement("span");
          name.textContent=`${row.flag} ${row.countryName}`;

          const value=D.createElement("strong");
          value.textContent=fmtEH(point.eh*row.share);

          line.append(name,value);
          tipRows.appendChild(line);
        }

        tooltip.hidden=false;
        tooltip.style.left=`${Math.max(16,Math.min(84,x/g.BOX.w*100))}%`;
        tooltip.style.top="68%";
      };

      svgRoot.onpointerleave=()=>{
        crosshair.style.opacity="0";
        tooltip.hidden=true;
      };
    }

    return {
      series:g.topRows.length,
      points:g.history.length
    };
  }

  W.ZZXHashrateNationCharts=Object.freeze({
    __version:3,
    renderRank,
    renderTimeline
  });
})();
