(()=>{"use strict";
const $=id=>document.getElementById(id),MT=MetaTagDBCore;
let records=[],selected=null,objectURL=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KiB`:`${(n/1048576).toFixed(2)} MiB`}
async function inspectMedia(file){
 const rec={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),name:file.name,type:file.type||"unknown",bytes:file.size,lastModified:new Date(file.lastModified).toISOString(),sha256:await MT.sha256(file),extension:MT.ext(file.name),...MT.parseName(file.name),duration:null,width:null,height:null,dhash:null,tags:[],notes:"",source:"local-file"};
 rec.tags=[...rec.suggestedTags];
 if(file.type.startsWith("image/")){
  const u=URL.createObjectURL(file),img=new Image();
  await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=u});
  rec.width=img.naturalWidth;rec.height=img.naturalHeight;
  const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d").drawImage(img,0,0);
  rec.dhash=MT.dhashFromCanvas(c);URL.revokeObjectURL(u)
 } else if(file.type.startsWith("video/")||file.type.startsWith("audio/")){
  const u=URL.createObjectURL(file),el=document.createElement(file.type.startsWith("video/")?"video":"audio");el.preload="metadata";
  await new Promise((ok,fail)=>{el.onloadedmetadata=ok;el.onerror=fail;el.src=u});
  rec.duration=el.duration;if(el.videoWidth){rec.width=el.videoWidth;rec.height=el.videoHeight}
  if(file.type.startsWith("video/")){
    try{el.currentTime=Math.min(1,Math.max(0,el.duration*.1));await new Promise(ok=>{el.onseeked=ok;setTimeout(ok,700)});const c=document.createElement("canvas");c.width=Math.max(1,el.videoWidth);c.height=Math.max(1,el.videoHeight);c.getContext("2d").drawImage(el,0,0);rec.dhash=MT.dhashFromCanvas(c)}catch{}
  }
  URL.revokeObjectURL(u)
 }
 rec._file=file;return rec
}
$("files").onchange=async()=>{
 const fs=[...$("files").files];$("status").textContent=`Inspecting ${fs.length} file(s)…`;
 for(const f of fs){try{records.push(await inspectMedia(f))}catch(e){records.push({id:Math.random().toString(36).slice(2),name:f.name,type:f.type||"unknown",bytes:f.size,error:e.message,tags:[],_file:f})}}
 render();$("status").textContent=`Loaded ${fs.length} file(s).`;$("files").value=""
};
function render(){
 const tb=$("record-body");tb.replaceChildren();
 records.forEach((r,i)=>{const tr=document.createElement("tr");tr.innerHTML=`<td><button class="btn ghost" data-i="${i}">OPEN</button></td><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td>${fmtBytes(r.bytes||0)}</td><td>${r.duration==null?"—":r.duration.toFixed(2)+" s"}</td><td>${r.width?`${r.width}×${r.height}`:"—"}</td><td>${r.sha256?r.sha256.slice(0,14)+"…":"—"}</td><td>${r.dhash||"—"}</td>`;tb.append(tr)});
 tb.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>select(+b.dataset.i));
 $("count").textContent=records.length;$("bytes").textContent=fmtBytes(records.reduce((s,r)=>s+(r.bytes||0),0));$("tag-count").textContent=new Set(records.flatMap(r=>r.tags||[])).size;$("fingerprints").textContent=records.filter(r=>r.dhash).length
}
function select(i){
 selected=records[i];$("sel-name").textContent=selected.name;$("tag-input").value=(selected.tags||[]).join(", ");$("notes").value=selected.notes||"";
 $("selected-output").textContent=JSON.stringify(strip(selected),null,2);
 if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;$("preview-img").hidden=true;$("preview-video").hidden=true;$("preview-audio").hidden=true;
 if(selected._file){objectURL=URL.createObjectURL(selected._file);if(selected.type.startsWith("image/")){$("preview-img").src=objectURL;$("preview-img").hidden=false}else if(selected.type.startsWith("video/")){$("preview-video").src=objectURL;$("preview-video").hidden=false}else if(selected.type.startsWith("audio/")){$("preview-audio").src=objectURL;$("preview-audio").hidden=false}}
}
function strip(r){const {_file,...x}=r;return x}
$("save-tags").onclick=()=>{if(!selected)return;selected.tags=[...new Set($("tag-input").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean))];selected.notes=$("notes").value.trim();render();$("selected-output").textContent=JSON.stringify(strip(selected),null,2)};
$("auto-tags").onclick=()=>{if(!selected)return;const extra=[];if(selected.type.startsWith("video/"))extra.push("video");if(selected.type.startsWith("audio/"))extra.push("audio");if(selected.type.startsWith("image/"))extra.push("image");if(selected.duration>3600)extra.push("longform");if(selected.width>=3840)extra.push("4k");if(selected.width>=1920&&selected.width<3840)extra.push("hd");selected.tags=[...new Set([...(selected.tags||[]),...(selected.suggestedTags||[]),...extra])];$("tag-input").value=selected.tags.join(", ");render()};
$("export-json").onclick=()=>MT.download(JSON.stringify({schema:"zzx.metatagdb.library.v1",generated:new Date().toISOString(),records:records.map(strip)},null,2),"metatagdb-library.json");
$("export-csv").onclick=()=>{const rows=[["name","type","bytes","duration","width","height","sha256","dhash","tags","notes"],...records.map(r=>[r.name,r.type,r.bytes,r.duration??"",r.width??"",r.height??"",r.sha256??"",r.dhash??"",(r.tags||[]).join("|"),r.notes||""])];const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");MT.download(csv,"metatagdb-library.csv","text/csv")};
$("dedupe").onclick=()=>{const groups={};for(const r of records){const k=r.sha256||r.dhash||r.name;(groups[k]??=[]).push(strip(r))}$("dedupe-output").textContent=JSON.stringify(Object.entries(groups).filter(([,v])=>v.length>1).map(([key,items])=>({key,items})),null,2)};
render();window.MetaTagDB=Object.freeze({version:"0.4.0-alpha-web",getRecords:()=>records.map(strip)});
})();
