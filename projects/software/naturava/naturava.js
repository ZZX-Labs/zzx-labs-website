(()=>{"use strict";
const $=id=>document.getElementById(id),N=NaturaVACore;
let records=[],selected=null,objurl=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function inspect(f){
 const r={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),name:f.name,type:f.type||"unknown",bytes:f.size,sha256:await N.sha256(f),duration:null,width:null,height:null,tags:N.tokens(f.name),species:[],locationLabel:"",dateLabel:"",notes:"",_file:f};
 if(f.type.startsWith("video/")){const u=URL.createObjectURL(f),v=document.createElement("video");v.preload="metadata";await new Promise((ok,fail)=>{v.onloadedmetadata=ok;v.onerror=fail;v.src=u});r.duration=v.duration;r.width=v.videoWidth;r.height=v.videoHeight;URL.revokeObjectURL(u)}
 return r
}
$("files").onchange=async()=>{for(const f of [...$("files").files]){try{records.push(await inspect(f))}catch(e){records.push({name:f.name,type:f.type,bytes:f.size,error:e.message,tags:[],species:[],_file:f})}}render();$("files").value=""};
function strip(r){const {_file,...x}=r;return x}
function render(){
 const q=$("search").value.trim().toLowerCase(),list=records.filter(r=>!q||JSON.stringify(strip(r)).toLowerCase().includes(q));
 const tb=$("body");tb.replaceChildren();list.forEach(r=>{const i=records.indexOf(r),tr=document.createElement("tr");tr.innerHTML=`<td><button class="btn ghost" data-i="${i}">OPEN</button></td><td>${esc(r.name)}</td><td>${r.duration==null?"—":r.duration.toFixed(1)+" s"}</td><td>${r.width?`${r.width}×${r.height}`:"—"}</td><td>${(r.tags||[]).join(" · ")}</td><td>${(r.species||[]).join(" · ")||"—"}</td><td>${r.sha256?r.sha256.slice(0,14)+"…":"—"}</td>`;tb.append(tr)});
 tb.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>select(+b.dataset.i));
 $("count").textContent=records.length;$("visible").textContent=list.length;$("dupes").textContent=records.length-new Set(records.map(r=>r.sha256)).size;$("tags-count").textContent=new Set(records.flatMap(r=>r.tags||[])).size
}
$("search").oninput=render;
function select(i){selected=records[i];$("sel").textContent=selected.name;$("tags").value=(selected.tags||[]).join(", ");$("species").value=(selected.species||[]).join(", ");$("location").value=selected.locationLabel||"";$("date").value=selected.dateLabel||"";$("notes").value=selected.notes||"";$("selected-output").textContent=JSON.stringify(strip(selected),null,2);if(objurl)URL.revokeObjectURL(objurl);objurl=null;$("video").hidden=true;if(selected._file?.type.startsWith("video/")){objurl=URL.createObjectURL(selected._file);$("video").src=objurl;$("video").hidden=false}}
$("save").onclick=()=>{if(!selected)return;selected.tags=[...new Set($("tags").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean))];selected.species=[...new Set($("species").value.split(",").map(x=>x.trim()).filter(Boolean))];selected.locationLabel=$("location").value.trim();selected.dateLabel=$("date").value;selected.notes=$("notes").value.trim();render();$("selected-output").textContent=JSON.stringify(strip(selected),null,2)};
$("dedupe").onclick=()=>{const map={};for(const r of records)(map[r.sha256]??=[]).push(strip(r));$("dedupe-output").textContent=JSON.stringify(Object.entries(map).filter(([,v])=>v.length>1).map(([sha256,items])=>({sha256,items})),null,2)};
$("export-json").onclick=()=>N.download(JSON.stringify({schema:"zzx.naturava.archive.v1",generated:new Date().toISOString(),records:records.map(strip)},null,2),"naturava-archive.json");
$("export-csv").onclick=()=>{const rows=[["name","type","bytes","duration","width","height","sha256","tags","species","location","date","notes"],...records.map(r=>[r.name,r.type,r.bytes,r.duration??"",r.width??"",r.height??"",r.sha256??"",(r.tags||[]).join("|"),(r.species||[]).join("|"),r.locationLabel||"",r.dateLabel||"",r.notes||""])];N.download(rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"),"naturava-archive.csv","text/csv")};
render();window.NaturaVA=Object.freeze({version:"0.2.0-alpha-web"});
})();
