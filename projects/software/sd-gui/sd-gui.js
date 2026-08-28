(()=>{"use strict";
const $=id=>document.getElementById(id);let queue=[],history=[],gallery=[];
function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}
function buildJob(){
 const j={id:uid(),created:new Date().toISOString(),prompt:$("prompt").value.trim(),negative:$("negative").value.trim(),model:$("model").value.trim(),scheduler:$("scheduler").value,width:+$("width").value,height:+$("height").value,steps:+$("steps").value,guidance:+$("guidance").value,seed:+$("seed").value||0,batch:+$("batch").value||1,status:"queued",browserInference:false};
 if(!j.prompt)return null;queue.push(j);history.unshift({prompt:j.prompt,negative:j.negative,model:j.model,seed:j.seed,at:j.created});render();return j
}
$("queue-job").onclick=()=>buildJob();
function render(){const e=$("queue");e.replaceChildren();queue.forEach((j,i)=>{const d=document.createElement("div");d.className="sd-job";d.innerHTML=`<strong>${j.status} · ${j.model}</strong><p>${j.prompt}</p><div class="fx-watermark">${j.width}×${j.height} · ${j.steps} steps · CFG ${j.guidance} · seed ${j.seed}</div><button class="btn ghost" data-r="${i}">REMOVE</button>`;e.append(d)});e.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{queue.splice(+b.dataset.r,1);render()});$("queue-count").textContent=queue.length;$("history").textContent=JSON.stringify(history.slice(0,100),null,2)}
$("random-seed").onclick=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);$("seed").value=a[0]};
$("gallery-files").onchange=async()=>{for(const f of [...$("gallery-files").files]){const u=URL.createObjectURL(f),h=await crypto.subtle.digest("SHA-256",await f.arrayBuffer());gallery.push({name:f.name,type:f.type||"image",bytes:f.size,sha256:[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join(""),url:u})}renderGallery();$("gallery-files").value=""};
function renderGallery(){const e=$("gallery");e.replaceChildren();gallery.forEach(g=>{const d=document.createElement("div");d.className="fx-card";d.innerHTML=`<img src="${g.url}" alt=""><div class="fx-watermark">${g.name}<br>${g.sha256.slice(0,16)}…</div>`;e.append(d)});$("gallery-count").textContent=gallery.length}
$("export-queue").onclick=()=>dl(JSON.stringify({schema:"zzx.sd-gui.queue.v1",exported:new Date().toISOString(),queue,history,browserInference:false,nativeAdapter:"torch/diffusers"},null,2),"sd-gui-queue.json");
$("export-gallery").onclick=()=>dl(JSON.stringify({schema:"zzx.sd-gui.gallery.v1",exported:new Date().toISOString(),images:gallery.map(({url,...g})=>g)},null,2),"sd-gui-gallery.json");
function dl(t,n){const b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("random-seed").click();render();renderGallery();window.SDGUI=Object.freeze({version:"0.4.0-alpha-web",browserInference:false});
})();
