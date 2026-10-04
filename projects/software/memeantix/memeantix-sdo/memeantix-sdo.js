(()=>{"use strict";
const $=id=>document.getElementById(id);
let items=[],scenario=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("add-item").onclick=()=>{
 const when=$("when").value,variant=$("variant").value.trim(),channel=$("channel").value,gate=$("gate").value;
 items.push({id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),when:when||null,variant,channel,gate,status:"planned"});
 items.sort((a,b)=>String(a.when).localeCompare(String(b.when)));render()
};
function render(){
 const e=$("timeline");e.replaceChildren();
 items.forEach((x,i)=>{const d=document.createElement("div");d.className="sdo-item";d.innerHTML=`<strong>${esc(x.variant||"unnamed")}</strong><p>${esc(x.when||"unscheduled")} · ${esc(x.channel)} · gate: ${esc(x.gate)}</p><button class="btn ghost" data-i="${i}">REMOVE</button>`;e.append(d)});
 e.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{items.splice(+b.dataset.i,1);render()});
 $("count").textContent=items.length
}
$("build-scenario").onclick=()=>{
 scenario={schema:"zzx.memeantix.sdo.scenario.v1",name:$("name").value.trim(),purpose:$("purpose").value.trim(),timezone:$("timezone").value.trim()||"local",items:[...items],releaseMode:"manual-handoff",autoPosting:false,credentials:false,created:new Date().toISOString()};
 $("scenario-output").textContent=JSON.stringify(scenario,null,2)
};
$("dry-run").onclick=()=>{
 if(!scenario)$("build-scenario").click();
 const now=Date.now(),steps=scenario.items.map((x,i)=>{const t=x.when?new Date(x.when).getTime():null;return{order:i+1,variant:x.variant,channel:x.channel,scheduled:x.when,relativeMinutes:t==null?null:(t-now)/60000,gate:x.gate,action:"manual release handoff"}});
 $("dry-output").textContent=JSON.stringify({dryRun:true,generated:new Date().toISOString(),steps},null,2)
};
$("export-scenario").onclick=()=>{
 if(!scenario)$("build-scenario").click();
 const t=JSON.stringify(scenario,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-sdo-scenario.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)
};
render();window.MemeantixSDO=Object.freeze({version:"0.1.0",autoPosting:false});
})();
