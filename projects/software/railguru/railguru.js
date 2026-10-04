(()=>{"use strict";
const $=id=>document.getElementById(id);
let options=[],plan=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("add-option").onclick=()=>{const x={id:Math.random().toString(36).slice(2),mode:$("mode").value,from:$("from").value.trim(),to:$("to").value.trim(),depart:$("depart").value,arrive:$("arrive").value,cost:+$("cost").value||0,currency:$("currency").value,operator:$("operator").value.trim(),notes:$("notes").value.trim()};if(!x.from||!x.to)return;options.push(x);renderOptions()};
function minutes(t){const d=new Date(t);return Number.isFinite(d.getTime())?d.getTime()/60000:null}
function renderOptions(){const tb=$("body");tb.replaceChildren();options.forEach((x,i)=>{const a=minutes(x.arrive),d=minutes(x.depart),dur=a!=null&&d!=null?(a-d):null,tr=document.createElement("tr");tr.innerHTML=`<td>${x.mode}</td><td>${esc(x.from)} → ${esc(x.to)}</td><td>${esc(x.operator)}</td><td>${dur==null?"—":(dur/60).toFixed(2)+" h"}</td><td>${x.currency} ${x.cost.toFixed(2)}</td><td><button class="btn ghost" data-i="${i}">REMOVE</button></td>`;tb.append(tr)});tb.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{options.splice(+b.dataset.i,1);renderOptions()});$("count").textContent=options.length}
$("optimize").onclick=()=>{
 const objective=$("objective").value,budget=Math.max(0,+$("budget").value||Infinity),filtered=options.filter(x=>x.cost<=budget||!Number.isFinite(budget));
 const scored=filtered.map(x=>{const d=minutes(x.depart),a=minutes(x.arrive),hours=d!=null&&a!=null?Math.max(.01,(a-d)/60):24;let score=0;if(objective==="cheapest")score=x.cost;else if(objective==="fastest")score=hours;else score=x.cost+hours*10;return{...x,hours,score}}).sort((a,b)=>a.score-b.score);
 plan={schema:"zzx.railguru.plan.v1",created:new Date().toISOString(),objective,budget:Number.isFinite(budget)?budget:null,selected:scored.slice(0,Math.min(6,scored.length)),source:"user-entered options",liveApi:false};
 renderPlan()
};
function renderPlan(){const e=$("plan");e.replaceChildren();(plan?.selected||[]).forEach((x,i)=>{const d=document.createElement("div");d.className="rg-leg";d.innerHTML=`<strong>${i+1}. ${esc(x.from)} → ${esc(x.to)}</strong><div class="fx-watermark">${esc(x.mode)} · ${esc(x.operator)} · ${x.hours.toFixed(2)} h · ${x.currency} ${x.cost.toFixed(2)}</div><p>${esc(x.notes)}</p>`;e.append(d)});$("plan-output").textContent=JSON.stringify(plan,null,2)}
$("export").onclick=()=>{if(!plan)$("optimize").click();const t=JSON.stringify(plan,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="railguru-itinerary.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
renderOptions();window.RailGuru=Object.freeze({version:"0.1.0-alpha-web",liveApi:false,booking:false});
})();
