(()=>{"use strict";
const $=id=>document.getElementById(id);
let features=[],contacts=[],cases=[],escrows=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function featureRecord(){
 return{id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),type:"Feature",geometry:{type:"Point",coordinates:[+$("lon").value||0,+$("lat").value||0]},properties:{name:$("property-name").value.trim(),status:$("property-status").value,parcelId:$("parcel").value.trim(),ownerRef:$("owner-ref").value.trim(),notes:$("property-notes").value.trim(),source:"operator-entered"}}
}
$("add-feature").onclick=()=>{const f=featureRecord();if(!f.properties.name)return;features.push(f);renderAll()};
$("geojson").onchange=async()=>{const f=$("geojson").files[0];if(!f)return;try{const j=JSON.parse(await f.text());const arr=j.type==="FeatureCollection"?j.features:j.type==="Feature"?[j]:[];features.push(...arr.filter(x=>x.geometry?.type==="Point"&&Array.isArray(x.geometry.coordinates)));renderAll()}catch(e){$("io-output").textContent="IMPORT ERROR: "+e.message}$("geojson").value=""};
$("add-contact").onclick=()=>{const x={id:Math.random().toString(36).slice(2),name:$("contact-name").value.trim(),role:$("contact-role").value.trim(),email:$("contact-email").value.trim(),phone:$("contact-phone").value.trim(),notes:$("contact-notes").value.trim()};if(!x.name)return;contacts.push(x);renderContacts()};
$("add-case").onclick=()=>{const x={id:Math.random().toString(36).slice(2),title:$("case-title").value.trim(),propertyId:$("case-property").value.trim(),type:$("case-type").value,status:$("case-status").value,deadline:$("case-deadline").value||null,notes:$("case-notes").value.trim()};if(!x.title)return;cases.push(x);renderCases()};
$("add-escrow").onclick=()=>{const x={id:Math.random().toString(36).slice(2),propertyId:$("escrow-property").value.trim(),amount:+$("escrow-amount").value||0,currency:$("escrow-currency").value,status:$("escrow-status").value,reference:$("escrow-ref").value.trim(),note:"workflow record only; no funds held or moved by browser"};escrows.push(x);$("escrow-output").textContent=JSON.stringify(escrows,null,2)};
function renderAll(){
 const tb=$("property-body");tb.replaceChildren();features.forEach((f,i)=>{const c=f.geometry.coordinates,p=f.properties||{},tr=document.createElement("tr");tr.innerHTML=`<td>${i+1}</td><td>${esc(p.name||"unnamed")}</td><td>${c[1].toFixed(6)}, ${c[0].toFixed(6)}</td><td>${esc(p.parcelId||"—")}</td><td>${esc(p.status||"—")}</td>`;tb.append(tr)});
 $("prop-count").textContent=features.length;drawMap()
}
function drawMap(){
 const c=$("map"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle="#070b0b";x.fillRect(0,0,w,h);
 x.strokeStyle="#1d2929";for(let i=0;i<=10;i++){x.beginPath();x.moveTo(i*w/10,0);x.lineTo(i*w/10,h);x.stroke();x.beginPath();x.moveTo(0,i*h/10);x.lineTo(w,i*h/10);x.stroke()}
 if(!features.length)return;
 const pts=features.map(f=>({lon:+f.geometry.coordinates[0],lat:+f.geometry.coordinates[1],name:f.properties?.name||"point"})),lons=pts.map(p=>p.lon),lats=pts.map(p=>p.lat),minx=Math.min(...lons),maxx=Math.max(...lons),miny=Math.min(...lats),maxy=Math.max(...lats),dx=Math.max(.0001,maxx-minx),dy=Math.max(.0001,maxy-miny);
 pts.forEach((p,i)=>{const px=40+(p.lon-minx)/dx*(w-80),py=h-40-(p.lat-miny)/dy*(h-80);x.fillStyle="#c0d674";x.beginPath();x.arc(px,py,7,0,Math.PI*2);x.fill();x.fillStyle="#e8e8e8";x.font="12px monospace";x.fillText(p.name,px+10,py+4)})
}
function renderContacts(){const e=$("contacts");e.replaceChildren();contacts.forEach(x=>{const d=document.createElement("div");d.className="case-card";d.innerHTML=`<strong>${esc(x.name)}</strong><div class="fx-watermark">${esc(x.role)} · ${esc(x.email)} · ${esc(x.phone)}</div><p>${esc(x.notes)}</p>`;e.append(d)});$("contact-count").textContent=contacts.length}
function renderCases(){const e=$("cases");e.replaceChildren();cases.forEach(x=>{const d=document.createElement("div");d.className="case-card";d.innerHTML=`<strong>${esc(x.title)}</strong> <span class="status-pill">${esc(x.status)}</span><div class="fx-watermark">${esc(x.type)} · property ${esc(x.propertyId||"—")} · deadline ${esc(x.deadline||"—")}</div><p>${esc(x.notes)}</p>`;e.append(d)});$("case-count").textContent=cases.length}
function download(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-geojson").onclick=()=>download(JSON.stringify({type:"FeatureCollection",features},null,2),"ownmap-properties.geojson","application/geo+json");
$("export-workspace").onclick=()=>download(JSON.stringify({schema:"zzx.ownmap.workspace.v1",exported:new Date().toISOString(),features,contacts,cases,escrows},null,2),"ownmap-workspace.json");
renderAll();renderContacts();renderCases();window.OwnMap=Object.freeze({version:"0.1.0-alpha-web",fundsCustody:false});
})();
