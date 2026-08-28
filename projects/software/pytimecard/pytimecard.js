(()=>{"use strict";
const $=id=>document.getElementById(id);
let shifts=[];
function mins(t){const [h,m]=String(t||"00:00").split(":").map(Number);return h*60+m}
function dur(s){let d=mins(s.end)-mins(s.start)-s.breakMinutes;if(d<0)d+=1440;return Math.max(0,d)/60}
function calc(s){const h=dur(s),reg=Math.min(h,8),ot=Math.max(0,h-8),gross=reg*s.rate+ot*s.rate*s.otMultiplier;return{hours:h,regularHours:reg,overtimeHours:ot,gross}}
function render(){
 const tb=$("body");tb.replaceChildren();let totalH=0,totalGross=0;
 shifts.forEach((s,i)=>{const c=calc(s);totalH+=c.hours;totalGross+=c.gross;const tr=document.createElement("tr");tr.innerHTML=`<td>${s.date}</td><td>${s.project}</td><td>${s.start}</td><td>${s.end}</td><td>${s.breakMinutes}</td><td>${c.hours.toFixed(2)}</td><td>$${s.rate.toFixed(2)}</td><td class="pay-positive">$${c.gross.toFixed(2)}</td><td><button class="btn ghost" data-i="${i}">REMOVE</button></td>`;tb.append(tr)});
 tb.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{shifts.splice(+b.dataset.i,1);render()});
 $("shift-count").textContent=shifts.length;$("hours-total").textContent=totalH.toFixed(2);$("gross-total").textContent="$"+totalGross.toFixed(2);$("days-total").textContent=new Set(shifts.map(s=>s.date)).size;
 $("summary").textContent=JSON.stringify({shifts:shifts.length,hours:totalH,grossEstimate:totalGross,currency:$("currency").value,note:"estimate only; payroll/tax rules not applied"},null,2)
}
$("add").onclick=()=>{const s={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),date:$("date").value,start:$("start").value,end:$("end").value,breakMinutes:Math.max(0,+$("break").value||0),project:$("project").value.trim(),rate:Math.max(0,+$("rate").value||0),otMultiplier:Math.max(1,+$("ot").value||1.5),notes:$("notes").value.trim(),created:new Date().toISOString()};if(!s.date||!s.start||!s.end)return;shifts.push(s);render()};
$("currency").onchange=render;
function download(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-json").onclick=()=>download(JSON.stringify({schema:"zzx.pytimecard.v1",exported:new Date().toISOString(),currency:$("currency").value,shifts},null,2),"pytimecard.json","application/json");
$("export-csv").onclick=()=>{const head=["date","project","start","end","breakMinutes","hours","rate","gross","notes"],rows=[head,...shifts.map(s=>{const c=calc(s);return[s.date,s.project,s.start,s.end,s.breakMinutes,c.hours.toFixed(2),s.rate.toFixed(2),c.gross.toFixed(2),s.notes]})],csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");download(csv,"pytimecard.csv","text/csv")};
$("date").value=new Date().toISOString().slice(0,10);render();window.PyTimecard=Object.freeze({version:"0.9.0-beta-web"});
})();
