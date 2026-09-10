// __partials/widgets/hashrate/js/chart.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXHashrateChart?.__version||0)>=2)return;

  const NS="http://www.w3.org/2000/svg";
  const BOX={w:640,h:240,left:54,right:14,top:14,bottom:30};

  function finite(value){
    if(value===null||value===undefined)return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function fmtEH(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(3)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function svgEl(tag,attrs={}){
    const el=D.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs)){
      el.setAttribute(key,String(value));
    }
    return el;
  }

  function clear(el){
    if(el)el.replaceChildren();
  }

  function niceBounds(values){
    const min=Math.min(...values);
    const max=Math.max(...values);

    if(min===max){
      const pad=Math.max(1,min*.03);
      return {min:Math.max(0,min-pad),max:max+pad};
    }

    const rawPad=(max-min)*.08;
    return {
      min:Math.max(0,min-rawPad),
      max:max+rawPad
    };
  }

  function geometry(history){
    const values=history.map(p=>p.eh);
    const bounds=niceBounds(values);
    const tMin=history[0].t;
    const tMax=history.at(-1).t;
    const tSpan=Math.max(1,tMax-tMin);
    const ySpan=Math.max(1e-9,bounds.max-bounds.min);

    const x=t=>BOX.left+((t-tMin)/tSpan)*(BOX.w-BOX.left-BOX.right);
    const y=v=>BOX.top+(1-((v-bounds.min)/ySpan))*(BOX.h-BOX.top-BOX.bottom);

    const points=history.map(p=>({
      ...p,
      x:x(p.t),
      y:y(p.eh)
    }));

    return {bounds,tMin,tMax,x,y,points};
  }

  function pathFrom(points){
    if(!points.length)return "";
    return points
      .map((p,i)=>`${i?"L":"M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  }

  function areaPath(points){
    if(!points.length)return "";
    const base=BOX.h-BOX.bottom;
    return [
      `M${points[0].x.toFixed(2)},${base}`,
      ...points.map(p=>`L${p.x.toFixed(2)},${p.y.toFixed(2)}`),
      `L${points.at(-1).x.toFixed(2)},${base}`,
      "Z"
    ].join(" ");
  }

  function renderAxes(root,g){
    const grid=root.querySelector("[data-hr-grid]");
    const yLabels=root.querySelector("[data-hr-y-labels]");
    const xLabels=root.querySelector("[data-hr-x-labels]");
    clear(grid);
    clear(yLabels);
    clear(xLabels);

    for(let i=0;i<5;i++){
      const fraction=i/4;
      const y=BOX.top+fraction*(BOX.h-BOX.top-BOX.bottom);
      const value=g.bounds.max-fraction*(g.bounds.max-g.bounds.min);

      grid.appendChild(svgEl("line",{
        x1:BOX.left,y1:y,x2:BOX.w-BOX.right,y2:y
      }));

      const label=svgEl("text",{
        x:BOX.left-7,
        y:y+3,
        "text-anchor":"end"
      });
      label.textContent=value>=1000
        ? `${(value/1000).toFixed(2)}Z`
        : `${Math.round(value)}E`;
      yLabels.appendChild(label);
    }

    const tickCount=4;
    for(let i=0;i<tickCount;i++){
      const fraction=i/(tickCount-1);
      const t=g.tMin+fraction*(g.tMax-g.tMin);
      const x=g.x(t);

      const label=svgEl("text",{
        x,
        y:BOX.h-9,
        "text-anchor":i===0?"start":i===tickCount-1?"end":"middle"
      });

      label.textContent=new Date(t).toLocaleDateString(undefined,{
        month:"short",
        day:"numeric"
      });

      xLabels.appendChild(label);
    }
  }

  function nearest(points,x){
    if(!points.length)return null;
    let best=points[0];
    let distance=Math.abs(points[0].x-x);

    for(let i=1;i<points.length;i++){
      const next=Math.abs(points[i].x-x);
      if(next<distance){
        distance=next;
        best=points[i];
      }
    }

    return best;
  }

  function attachInteraction(root,g){
    const svg=root.querySelector("[data-hr-svg]");
    const crosshair=root.querySelector("[data-hr-crosshair]");
    const point=root.querySelector("[data-hr-point]");
    const tooltip=root.querySelector("[data-hr-tooltip]");
    const tipValue=root.querySelector("[data-hr-tip-value]");
    const tipTime=root.querySelector("[data-hr-tip-time]");

    if(!svg||!crosshair||!point||!tooltip)return;

    const move=event=>{
      const rect=svg.getBoundingClientRect();
      if(!rect.width||!rect.height)return;

      const px=(event.clientX-rect.left)/rect.width*BOX.w;
      const item=nearest(g.points,px);
      if(!item)return;

      crosshair.setAttribute("x1",item.x);
      crosshair.setAttribute("x2",item.x);
      crosshair.setAttribute("y1",BOX.top);
      crosshair.setAttribute("y2",BOX.h-BOX.bottom);
      crosshair.style.opacity="1";

      point.setAttribute("cx",item.x);
      point.setAttribute("cy",item.y);
      point.style.opacity="1";

      tipValue.textContent=fmtEH(item.eh);
      tipTime.textContent=new Date(item.t).toLocaleString();

      tooltip.hidden=false;
      tooltip.style.left=`${Math.max(10,Math.min(90,item.x/BOX.w*100))}%`;
      tooltip.style.top=`${Math.max(16,Math.min(92,item.y/BOX.h*100))}%`;
    };

    const leave=()=>{
      crosshair.style.opacity="0";
      point.style.opacity="0";
      tooltip.hidden=true;
    };

    svg.onpointermove=move;
    svg.onpointerleave=leave;
  }

  function render(root,history){
    const line=root.querySelector("[data-hr-line]");
    const area=root.querySelector("[data-hr-area]");
    const empty=root.querySelector("[data-hr-chart-empty]");
    const crosshair=root.querySelector("[data-hr-crosshair]");
    const point=root.querySelector("[data-hr-point]");
    const tooltip=root.querySelector("[data-hr-tooltip]");

    if(crosshair)crosshair.style.opacity="0";
    if(point)point.style.opacity="0";
    if(tooltip)tooltip.hidden=true;

    if(!Array.isArray(history)||history.length<2){
      if(line)line.setAttribute("d","");
      if(area)area.setAttribute("d","");
      if(empty)empty.hidden=false;
      clear(root.querySelector("[data-hr-grid]"));
      clear(root.querySelector("[data-hr-y-labels]"));
      clear(root.querySelector("[data-hr-x-labels]"));
      return {rendered:false,points:0};
    }

    if(empty)empty.hidden=true;

    const g=geometry(history);
    renderAxes(root,g);

    if(line)line.setAttribute("d",pathFrom(g.points));
    if(area)area.setAttribute("d",areaPath(g.points));

    attachInteraction(root,g);

    return {
      rendered:true,
      points:g.points.length,
      min:g.bounds.min,
      max:g.bounds.max
    };
  }

  W.ZZXHashrateChart=Object.freeze({
    __version:2,
    fmtEH,
    geometry,
    render
  });
})();
