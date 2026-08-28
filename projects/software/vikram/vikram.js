(()=>{"use strict";
const $=id=>document.getElementById(id);
let files=[],records=[],selected=null,selectedURL=null;
const textExt=new Set(["txt","md","json","csv","tsv","html","htm","css","js","mjs","py","sh","ps1","yaml","yml","toml","ini","log","xml"]);
const extOf=n=>{const i=n.lastIndexOf(".");return i>=0?n.slice(i+1).toLowerCase():""};
const human=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KiB`:n<1073741824?`${(n/1048576).toFixed(1)} MiB`:`${(n/1073741824).toFixed(2)} GiB`;
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function digest(f){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))}
function typeClass(f){
 const e=extOf(f.name),t=f.type||"";
 if(t.startsWith("image/"))return"image";if(t.startsWith("video/"))return"video";if(t.startsWith("audio/"))return"audio";
 if(e==="json")return"json";if(textExt.has(e)||t.startsWith("text/"))return"text";if(e==="pdf")return"pdf";return"binary"
}
function ingest(list){
 files=[...list];
 records=files.map((f,i)=>({i,name:f.name,path:f.webkitRelativePath||f.name,size:f.size,lastModified:f.lastModified,type:f.type||"",ext:extOf(f.name),class:typeClass(f),jsonKeys:[],hash:null}));
 $("status").textContent=`Loaded ${records.length} local file reference(s).`;filter()
}
$("directory").onchange=()=>{ingest($("directory").files);$("directory").value=""};
$("files").onchange=()=>{ingest($("files").files);$("files").value=""};
function filter(){
 const q=$("search").value.trim().toLowerCase(),kind=$("kind").value,ext=$("ext").value.trim().toLowerCase(),schema=$("schema-key").value.trim().toLowerCase(),min=+$("min-size").value||0,max=+$("max-size").value||Infinity;
 const list=records.filter(r=>(!q||(r.name+" "+r.path+" "+r.type).toLowerCase().includes(q))&&(!kind||r.class===kind)&&(!ext||r.ext===ext)&&r.size>=min&&r.size<=max&&(!schema||r.jsonKeys.some(k=>k.toLowerCase().includes(schema))));
 renderList(list)
}
["search","kind","ext","schema-key","min-size","max-size"].forEach(id=>$(id).oninput=filter);
function renderList(list){
 const e=$("file-list");e.replaceChildren();
 list.forEach(r=>{const b=document.createElement("button");b.className="vik-file"+(selected?.i===r.i?" active":"");b.innerHTML=`<strong>${r.name}</strong><small>${r.path}</small><small>${r.class} · ${human(r.size)} · ${new Date(r.lastModified).toLocaleString()}</small>`;b.onclick=()=>preview(r);e.append(b)});
 $("all-count").textContent=records.length;$("visible-count").textContent=list.length;$("bytes").textContent=human(records.reduce((s,r)=>s+r.size,0));$("types").textContent=new Set(records.map(r=>r.class)).size;drawMap(list)
}
async function preview(r){
 selected=r;if(selectedURL){URL.revokeObjectURL(selectedURL);selectedURL=null}const f=files[r.i],e=$("preview");e.replaceChildren();
 const meta=document.createElement("pre");meta.className="z-log";meta.textContent=JSON.stringify({name:r.name,path:r.path,size:r.size,type:r.type,class:r.class,lastModified:new Date(r.lastModified).toISOString(),sha256:r.hash,jsonKeys:r.jsonKeys},null,2);e.append(meta);
 try{
   if(r.class==="image"){selectedURL=URL.createObjectURL(f);const img=document.createElement("img");img.src=selectedURL;img.alt=r.name;e.append(img)}
   else if(r.class==="video"){selectedURL=URL.createObjectURL(f);const v=document.createElement("video");v.src=selectedURL;v.controls=true;e.append(v)}
   else if(r.class==="audio"){selectedURL=URL.createObjectURL(f);const a=document.createElement("audio");a.src=selectedURL;a.controls=true;e.append(a)}
   else if(r.class==="text"||r.class==="json"){const txt=await f.text(),pre=document.createElement("pre");pre.textContent=txt.slice(0,300000);e.append(pre);if(r.class==="json"){try{const j=JSON.parse(txt);r.jsonKeys=Array.isArray(j)?["[]",...(j[0]&&typeof j[0]==="object"?Object.keys(j[0]):[])]:j&&typeof j==="object"?Object.keys(j):[];meta.textContent=JSON.stringify({name:r.name,path:r.path,size:r.size,type:r.type,class:r.class,lastModified:new Date(r.lastModified).toISOString(),sha256:r.hash,jsonKeys:r.jsonKeys},null,2)}catch{}}}
   else if(r.class==="pdf"){selectedURL=URL.createObjectURL(f);const p=document.createElement("p");p.textContent="PDF selected. Browser inline embedding is intentionally not forced here; use the local file viewer or native Vikram preview backend.";e.append(p)}
   else{const p=document.createElement("p");p.textContent="Binary file: metadata/index operations are available; inline rendering is not attempted.";e.append(p)}
 }catch(err){const p=document.createElement("pre");p.textContent="PREVIEW ERROR: "+err.message;e.append(p)}
 filter()
}
$("hash-one").onclick=async()=>{if(!selected)return;const r=records[selected.i],f=files[r.i];$("status").textContent=`Hashing ${r.name}…`;r.hash=await digest(f);$("status").textContent=`SHA-256: ${r.hash}`;preview(r)};
$("hash-all").onclick=async()=>{for(let n=0;n<records.length;n++){if(!records[n].hash)records[n].hash=await digest(files[records[n].i]);$("status").textContent=`Hashing ${n+1}/${records.length}`}filter();$("status").textContent="Hash inventory complete."};
function drawMap(list){
 const c=$("map"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle="#050505";x.fillRect(0,0,w,h);
 if(!list.length)return;const cx=w/2,cy=h/2,max=Math.max(...list.map(r=>r.size),1);
 x.strokeStyle="#343434";x.fillStyle="#c0d674";x.font="11px monospace";
 list.slice(0,220).forEach((r,i)=>{const a=i/list.length*Math.PI*2*3,rad=35+Math.sqrt(i/list.length)*Math.min(w,h)*.4,px=cx+Math.cos(a)*rad,py=cy+Math.sin(a)*rad,rr=2+Math.sqrt(r.size/max)*8;x.beginPath();x.arc(px,py,rr,0,Math.PI*2);x.fill();if(i<24)x.fillText(r.name.slice(0,18),px+5,py-3)});
 x.strokeStyle="#c0d674";x.beginPath();x.arc(cx,cy,18,0,Math.PI*2);x.stroke()
}
function dl(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export").onclick=()=>dl(JSON.stringify({schema:"zzx.vikram.index.v1",exported:new Date().toISOString(),records:records.map(({i,...r})=>r),fileContentsIncluded:false},null,2),"vikram-index.json");
renderList([]);window.Vikram=Object.freeze({version:"0.2.0-alpha-web",readsLocalSelectionOnly:true});
})();
