(()=>{"use strict";
const $=id=>document.getElementById(id);
let mounts=[{path:"/",type:"virtual",rw:false},{path:"/apps",type:"app-layer",rw:true},{path:"/data",type:"local-storage",rw:true}],procs=[],apps=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pid(){return Math.floor(1000+Math.random()*8999)}
function boot(){
 procs=[
  {pid:1,name:"pyinit",state:"running",cpu:0.4,memMB:28},
  {pid:2,name:"pybus",state:"running",cpu:0.2,memMB:18},
  {pid:3,name:"pyservice-http",state:"sleeping",cpu:0.1,memMB:36}
 ];
 $("boot-state").textContent="BOOTED";render()
}
function render(){
 $("proc-count").textContent=procs.length;$("mount-count").textContent=mounts.length;$("app-count").textContent=apps.length;$("platform").textContent=$("target").value;
 const e=$("processes");e.replaceChildren();procs.forEach(p=>{const d=document.createElement("div");d.className="pyos-proc";d.innerHTML=`<strong>${p.pid} ${esc(p.name)}</strong><div class="fx-watermark">${p.state} · CPU ${p.cpu.toFixed(1)}% · ${p.memMB} MB</div>`;e.append(d)});
 $("tree").textContent=["/","├── apps/","├── data/","├── system/","│   ├── pyinit","│   ├── pybus","│   └── services/","└── users/"].join("\n");
 $("mounts").textContent=JSON.stringify(mounts,null,2);$("apps-output").textContent=JSON.stringify(apps,null,2)
}
$("boot").onclick=boot;
$("spawn").onclick=()=>{const name=$("proc-name").value.trim();if(!name)return;procs.push({pid:pid(),name,state:"running",cpu:0,memMB:16});render()};
$("kill").onclick=()=>{const id=+$("kill-pid").value;procs=procs.filter(p=>p.pid!==id||p.pid===1);render()};
$("install-app").onclick=()=>{const a={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),name:$("app-name").value.trim(),entry:$("entry").value.trim(),target:$("target").value,permissions:$("permissions").value.split(",").map(x=>x.trim()).filter(Boolean),installed:new Date().toISOString()};if(!a.name)return;apps.push(a);render()};
$("export").onclick=()=>{const doc={schema:"zzx.pyos.profile.v1",exported:new Date().toISOString(),target:$("target").value,mounts,processes:procs,apps,execution:"browser simulation",kernel:"not implemented in browser"},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="pyos-profile.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("target").onchange=render;boot();window.PyOS=Object.freeze({version:"0.2.0-alpha-web",realKernel:false});
})();
