(()=>{"use strict";
const $=id=>document.getElementById(id);
const presets=[
 {id:"creative-review",name:"Creative Review",steps:["select template pack","render variants","human review","export package"],mode:"manual"},
 {id:"ab-export",name:"A/B Export",steps:["render A/B variants","assign IDs","generate metadata","export assets"],mode:"manual"},
 {id:"archive-build",name:"Archive Build",steps:["normalize filenames","hash assets","write manifest","package archive"],mode:"local"},
 {id:"scheduled-package",name:"Scheduled Package",steps:["select approved assets","assign release slots","validate filenames","export SDO schedule"],mode:"package-only"},
 {id:"telemetry-review",name:"Telemetry Review",steps:["import aggregate metrics","calculate variant rates","flag anomalies","export review"],mode:"analysis"}
];
let current=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){
 const e=$("preset-list");e.replaceChildren();presets.forEach(p=>{const a=document.createElement("article");a.className="fx-card";a.innerHTML=`<strong>${esc(p.name)}</strong><p>${p.steps.map((x,i)=>`${i+1}. ${esc(x)}`).join("<br>")}</p><button class="btn ghost" data-id="${p.id}">LOAD</button>`;e.append(a)});e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>load(b.dataset.id))
}
function load(id){
 const p=presets.find(x=>x.id===id);current={...p,loadedAt:new Date().toISOString(),campaign:$("campaign").value.trim(),output:$("output").value,credentials:false,autoPosting:false};$("selected").textContent=p.name;const e=$("pipeline");e.replaceChildren();p.steps.forEach((x,i)=>{const d=document.createElement("div");d.className="fso-step";d.innerHTML=`<strong>${String(i+1).padStart(2,"0")}</strong><p>${esc(x)}</p>`;e.append(d)});$("plan-output").textContent=JSON.stringify(current,null,2)
}
$("build-custom").onclick=()=>{
 const steps=$("custom-steps").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 current={id:"custom",name:$("custom-name").value.trim()||"Custom FSO preset",campaign:$("campaign").value.trim(),steps,output:$("output").value,mode:"package-only",credentials:false,autoPosting:false};$("selected").textContent=current.name;const e=$("pipeline");e.replaceChildren();steps.forEach((x,i)=>{const d=document.createElement("div");d.className="fso-step";d.innerHTML=`<strong>${String(i+1).padStart(2,"0")}</strong><p>${esc(x)}</p>`;e.append(d)});$("plan-output").textContent=JSON.stringify(current,null,2)
};
$("export-preset").onclick=()=>{if(!current)load("creative-review");const doc={schema:"zzx.memeantix.fso.preset.v1",exported:new Date().toISOString(),preset:current,note:"Local/package automation only. External platform publishing requires a separately authorized adapter."},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-fso-preset.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();load("creative-review");window.MemeantixFSO=Object.freeze({version:"0.1.0",presets});
})();
