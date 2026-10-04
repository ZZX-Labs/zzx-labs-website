// __partials/widgets/global-power-grid/js/charts.js
(function(){
  "use strict";
  const W=window,D=document,NS="http://www.w3.org/2000/svg";
  if(Number(W.ZZXGlobalPowerGridCharts?.__version||0)>=2)return;

  function el(tag,attrs={}){
    const x=D.createElementNS(NS,tag);
    for(const [k,v] of Object.entries(attrs))x.setAttribute(k,String(v));
    return x;
  }
  function clear(x){if(x)x.replaceChildren()}
  function renderProfile(root,rows){
    const grid=root.querySelector("[data-gpg-profile-grid]");
    const gl=root.querySelector("[data-gpg-generation-line]");
    const ll=root.querySelector("[data-gpg-load-line]");
    const sl=root.querySelector("[data-gpg-spare-line]");
    const yl=root.querySelector("[data-gpg-profile-y]");
    const xl=root.querySelector("[data-gpg-profile-x]");
    const empty=root.querySelector("[data-gpg-profile-empty]");
    const cross=root.querySelector("[data-gpg-crosshair]");
    const tip=root.querySelector("[data-gpg-tooltip]");
    const svg=root.querySelector("[data-gpg-profile-chart] svg");
    [grid,yl,xl].forEach(clear);

    if(rows.length<2){
      [gl,ll,sl].forEach(p=>p?.setAttribute("d",""));
      if(empty)empty.hidden=false;
      return;
    }
    if(empty)empty.hidden=true;
    const B={w:640,h:250,l:54,r:14,t:14,b:30};
    const vals=rows.flatMap(r=>[r.generationMW,r.loadMW].filter(Number.isFinite));
    const max=Math.max(...vals,1)*1.08;
    const x=i=>B.l+i/(rows.length-1)*(B.w-B.l-B.r);
    const y=v=>B.t+(1-v/max)*(B.h-B.t-B.b);
    const path=key=>rows.map((r,i)=>Number.isFinite(r[key])?`${i?"L":"M"}${x(i)},${y(r[key])}`:"").filter(Boolean).join(" ");
    gl.setAttribute("d",path("generationMW"));ll.setAttribute("d",path("loadMW"));sl.setAttribute("d",path("spareMW"));

    for(let i=0;i<5;i++){
      const yy=B.t+i/4*(B.h-B.t-B.b),v=max*(1-i/4);
      grid.appendChild(el("line",{x1:B.l,y1:yy,x2:B.w-B.r,y2:yy}));
      const t=el("text",{x:B.l-7,y:yy+3,"text-anchor":"end"});t.textContent=v>=1e6?`${(v/1e6).toFixed(1)}T`:`${(v/1000).toFixed(0)}G`;yl.appendChild(t);
    }
    [0,Math.floor((rows.length-1)/3),Math.floor(2*(rows.length-1)/3),rows.length-1].forEach((idx,j)=>{
      const t=el("text",{x:x(idx),y:B.h-8,"text-anchor":j===0?"start":j===3?"end":"middle"});
      t.textContent=new Date(rows[idx].t).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});xl.appendChild(t);
    });

    svg.onpointermove=e=>{
      const rect=svg.getBoundingClientRect();
      const frac=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
      const idx=Math.round(frac*(rows.length-1)); const r=rows[idx]; const xx=x(idx);
      cross.setAttribute("x1",xx);cross.setAttribute("x2",xx);cross.setAttribute("y1",B.t);cross.setAttribute("y2",B.h-B.b);cross.style.opacity="1";
      root.querySelector("[data-gpg-tip-time]").textContent=new Date(r.t).toLocaleString();
      root.querySelector("[data-gpg-tip-generation]").textContent=`generation ${(r.generationMW/1000).toFixed(2)} GW`;
      root.querySelector("[data-gpg-tip-load]").textContent=`load ${(r.loadMW/1000).toFixed(2)} GW`;
      root.querySelector("[data-gpg-tip-spare]").textContent=`headroom ${(r.spareMW/1000).toFixed(2)} GW`;
      tip.hidden=false;tip.style.left=`${Math.max(15,Math.min(85,frac*100))}%`;tip.style.top="72%";
    };
    svg.onpointerleave=()=>{cross.style.opacity="0";tip.hidden=true};
  }

  function renderTimezones(root,zones){
    const grid=root.querySelector("[data-gpg-tz-grid]");
    const rows=root.querySelector("[data-gpg-tz-rows]");
    const xg=root.querySelector("[data-gpg-tz-x]");
    const empty=root.querySelector("[data-gpg-tz-empty]");
    [grid,rows,xg].forEach(clear);
    const shown=zones.slice(0,12);
    if(!shown.length){if(empty)empty.hidden=false;return}
    if(empty)empty.hidden=true;
    const B={w:640,h:300,l:150,r:12,t:20,b:28};
    const cellW=(B.w-B.l-B.r)/24, rowH=(B.h-B.t-B.b)/shown.length;

    for(let h=0;h<=24;h+=3){
      const xx=B.l+h*cellW;
      grid.appendChild(el("line",{x1:xx,y1:B.t,x2:xx,y2:B.h-B.b}));
      if(h<24){const t=el("text",{x:xx,y:B.h-8,"text-anchor":"middle"});t.textContent=String(h).padStart(2,"0");xg.appendChild(t)}
    }
    shown.forEach((z,ri)=>{
      const vals=z.curve.filter(Number.isFinite); const min=vals.length?Math.min(...vals):0,max=vals.length?Math.max(...vals):0;
      const y=B.t+ri*rowH;
      const label=el("text",{x:B.l-7,y:y+rowH*.66,"text-anchor":"end",class:"gpg-tz__label"});label.textContent=z.timezone;rows.appendChild(label);
      for(let h=0;h<24;h++){
        const v=z.curve[h]; let intensity=.08;
        if(Number.isFinite(v)&&max>min)intensity=.12+.78*(v-min)/(max-min);
        else if(Number.isFinite(v))intensity=.28;
        rows.appendChild(el("rect",{x:B.l+h*cellW,y:y+1,width:cellW-1,height:Math.max(2,rowH-2),fill:`rgba(192,214,116,${intensity.toFixed(3)})`,class:"gpg-tz__cell"}));
      }
      for(const h of z.peakHours){
        rows.appendChild(el("rect",{x:B.l+h*cellW,y:y+1,width:cellW-1,height:Math.max(2,rowH-2),class:"gpg-tz__peak"}));
      }
    });
  }

  
  function renderHistory(root,history){
    const svg=root.querySelector("[data-gpg-history-svg]");
    const grid=root.querySelector("[data-gpg-history-grid]");
    const generation=root.querySelector("[data-gpg-history-generation]");
    const load=root.querySelector("[data-gpg-history-load]");
    const capacity=root.querySelector("[data-gpg-history-capacity]");
    const xg=root.querySelector("[data-gpg-history-x]");
    const yg=root.querySelector("[data-gpg-history-y]");
    const cross=root.querySelector("[data-gpg-history-crosshair]");
    const tip=root.querySelector("[data-gpg-history-tooltip]");
    const empty=root.querySelector("[data-gpg-history-empty]");

    [grid,xg,yg].forEach(clear);
    [generation,load,capacity].forEach(p=>p&&p.setAttribute("d",""));

    const rows=Array.isArray(history)?history:[];
    if(!svg||rows.length<1){
      if(empty)empty.hidden=false;
      return {points:0,first:null,last:null};
    }
    if(empty)empty.hidden=true;

    const B={w:640,h:250,l:56,r:15,t:15,b:28};
    const values=rows.flatMap(r=>[r.generationMW,r.loadMW,r.capacityMW]).filter(Number.isFinite);
    if(!values.length){
      if(empty)empty.hidden=false;
      return {points:rows.length,first:rows[0]?.editionYear||null,last:rows.at(-1)?.editionYear||null};
    }

    const years=rows.map(r=>r.editionYear).filter(Number.isFinite);
    const minYear=Math.min(...years),maxYear=Math.max(...years);
    let minV=0,maxV=Math.max(...values);
    if(!(maxV>minV))maxV=minV+1;
    const pad=(maxV-minV)*.08;
    maxV+=pad;

    const xYear=year=>{
      if(maxYear===minYear)return (B.l+B.w-B.r)/2;
      return B.l+((year-minYear)/(maxYear-minYear))*(B.w-B.l-B.r);
    };
    const yVal=value=>B.t+(1-(value-minV)/(maxV-minV))*(B.h-B.t-B.b);

    for(let i=0;i<=4;i++){
      const y=B.t+i*(B.h-B.t-B.b)/4;
      grid.appendChild(el("line",{x1:B.l,y1:y,x2:B.w-B.r,y2:y}));
      const value=maxV-(i/4)*(maxV-minV);
      const t=el("text",{x:B.l-6,y:y+3,"text-anchor":"end"});
      t.textContent=value>=1e6?`${(value/1e6).toFixed(1)}T`:value>=1000?`${(value/1000).toFixed(0)}G`:`${value.toFixed(0)}M`;
      yg.appendChild(t);
    }

    const ticks=Math.min(6,Math.max(2,years.length));
    for(let i=0;i<ticks;i++){
      const year=Math.round(minYear+(i/(ticks-1||1))*(maxYear-minYear));
      const x=xYear(year);
      grid.appendChild(el("line",{x1:x,y1:B.t,x2:x,y2:B.h-B.b}));
      const t=el("text",{x,y:B.h-8,"text-anchor":"middle"});
      t.textContent=year;
      xg.appendChild(t);
    }

    function segmentedPath(key){
      let d="",started=false;
      for(const row of rows){
        const v=row[key];
        if(!Number.isFinite(v)){started=false;continue}
        const cmd=started?"L":"M";
        d+=`${cmd}${xYear(row.editionYear).toFixed(2)},${yVal(v).toFixed(2)}`;
        started=true;
      }
      return d;
    }

    generation?.setAttribute("d",segmentedPath("generationMW"));
    load?.setAttribute("d",segmentedPath("loadMW"));
    capacity?.setAttribute("d",segmentedPath("capacityMW"));

    svg.onpointermove=e=>{
      const rect=svg.getBoundingClientRect();
      if(!rect.width)return;
      const frac=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
      const targetYear=minYear+frac*(maxYear-minYear);
      let best=rows[0];

      for(const row of rows){
        if(Math.abs(row.editionYear-targetYear)<Math.abs(best.editionYear-targetYear))best=row;
      }

      const xx=xYear(best.editionYear);
      cross?.setAttribute("x1",xx);
      cross?.setAttribute("x2",xx);
      cross?.setAttribute("y1",B.t);
      cross?.setAttribute("y2",B.h-B.b);
      if(cross)cross.style.opacity="1";

      root.querySelector("[data-gpg-history-tip-year]").textContent=
        `World Factbook ${best.editionYear}${best.observationYear?` · observation ${best.observationYear}`:""}`;

      root.querySelector("[data-gpg-history-tip-generation]").textContent=
        `generation ${W.ZZXGlobalPowerGridUI.fmtPower(best.generationMW)}`;

      root.querySelector("[data-gpg-history-tip-load]").textContent=
        `demand ${W.ZZXGlobalPowerGridUI.fmtPower(best.loadMW)}`;

      root.querySelector("[data-gpg-history-tip-capacity]").textContent=
        `capacity ${W.ZZXGlobalPowerGridUI.fmtPower(best.capacityMW)}`;

      if(tip){
        tip.hidden=false;
        tip.style.left=`${Math.max(14,Math.min(86,frac*100))}%`;
        tip.style.top="70%";
      }
    };

    svg.onpointerleave=()=>{
      if(cross)cross.style.opacity="0";
      if(tip)tip.hidden=true;
    };

    return {points:rows.length,first:minYear,last:maxYear};
  }

  W.ZZXGlobalPowerGridCharts=Object.freeze({
    __version:2,
    renderProfile,
    renderTimezones,
    renderHistory
  });
})();
