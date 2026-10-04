(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={children:[],workflow:[]};
const groups={
 identity:["identityscope","emailscope","userscope","behaviorscope","linkscope"],
 network:["ipscope","macscope","telecomscope","devicescope","netscope","domainscope","signalscope"],
 spatial:["geoscope","timescope"],
 bitcoin:["bitcoinscope"],
 data:["datascope"]
};
function groupFor(slug){return Object.entries(groups).find(([,v])=>v.includes(slug))?.[0]||"other"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function load(){
 const r=await fetch("./scopez-children.json",{cache:"no-store"});
 state.children=(await r.json()).projects;
 render();
 draw();
 buildChecks();
}
function render(){
 const q=$("scope-search").value.trim().toLowerCase(),g=$("scope-group").value;
 const list=state.children.filter(p=>(!q||JSON.stringify(p).toLowerCase().includes(q))&&(!g||groupFor(p.slug)===g));
 $("visible-count").textContent=list.length;
 const e=$("scope-grid");e.replaceChildren();
 list.forEach(p=>{
  const a=document.createElement("article");a.className="scopez-card";
  a.innerHTML=`<span class="scopez-group">${groupFor(p.slug)}</span><h3>${esc(p.title)}</h3><p>${esc(p.blurb)}</p><div class="tags">${(p.tags||[]).slice(0,6).map(esc).join(" · ")}</div><a class="btn" href="./${p.slug}/">OPEN ${esc(p.title)}</a>`;
  e.append(a);
 });
}
$("scope-search").oninput=render;$("scope-group").onchange=render;

function buildChecks(){
 const e=$("workflow-checks");e.replaceChildren();
 state.children.forEach(p=>{
  const l=document.createElement("label");
  l.innerHTML=`<input type="checkbox" value="${p.slug}"> <strong>${esc(p.title)}</strong><br><span class="fx-watermark">${groupFor(p.slug)}</span>`;
  e.append(l);
 });
}
$("build-workflow").onclick=()=>{
 const selected=[...$("workflow-checks").querySelectorAll("input:checked")].map(x=>x.value);
 const doc={schema:"zzx.scopez.workflow.v1",created:new Date().toISOString(),name:$("workflow-name").value.trim()||"ScopeZ workflow",purpose:$("workflow-purpose").value.trim(),authorization:$("workflow-auth").value,steps:selected.map((slug,i)=>({order:i+1,slug,href:`/projects/software/scopez/${slug}/`})),principles:["public or authorized data only","probabilistic outputs are not identity proof","record source provenance","minimize unnecessary personal data"]};
 state.workflow=doc;$("workflow-output").textContent=JSON.stringify(doc,null,2);
};
$("export-workflow").onclick=()=>{
 const t=JSON.stringify(state.workflow||{error:"Build a workflow first."},null,2);
 const b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="scopez-workflow.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);
};

function draw(){
 const c=$("scope-canvas"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);
 const cx=w/2,cy=h/2,R=Math.min(w,h)*.36;
 const center={x:cx,y:cy};
 const pts=state.children.map((p,i)=>({p,x:cx+Math.cos(i/state.children.length*Math.PI*2-Math.PI/2)*R,y:cy+Math.sin(i/state.children.length*Math.PI*2-Math.PI/2)*R}));
 x.strokeStyle="#343434";x.lineWidth=1;
 pts.forEach(n=>{x.beginPath();x.moveTo(center.x,center.y);x.lineTo(n.x,n.y);x.stroke()});
 x.fillStyle="#c0d674";x.beginPath();x.arc(cx,cy,46,0,Math.PI*2);x.fill();x.fillStyle="#121212";x.font="700 16px monospace";x.textAlign="center";x.fillText("ScopeZ",cx,cy+5);
 pts.forEach(n=>{
  x.fillStyle="#e6a42b";x.beginPath();x.arc(n.x,n.y,9,0,Math.PI*2);x.fill();
  x.fillStyle="#e8e8e8";x.font="11px monospace";x.textAlign=n.x<cx?"right":"left";x.fillText(n.p.title,n.x+(n.x<cx?-14:14),n.y+4);
 });
}
load().catch(e=>$("scope-grid").innerHTML=`<article class="panel"><h3>Unable to load suite manifest</h3><p>${esc(e.message)}</p></article>`);
window.ScopeZ=Object.freeze({version:"0.1.0-alpha-web",groups});
})();
