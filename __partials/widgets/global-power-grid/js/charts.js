// __partials/widgets/global-power-grid/js/charts.js
(function(){
  "use strict";
  const W=window,D=document,NS="http://www.w3.org/2000/svg";
  if(Number(W.ZZXGlobalPowerGridCharts?.__version||0)>=1)return;

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

  W.ZZXGlobalPowerGridCharts=Object.freeze({__version:1,renderProfile,renderTimezones});
})();
