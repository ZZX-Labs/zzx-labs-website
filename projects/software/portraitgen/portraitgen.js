(()=>{"use strict";
const $=id=>document.getElementById(id),P=PortraitGenCore;
let refs=[],job=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("refs").onchange=async()=>{refs=[];for(const f of [...$("refs").files])refs.push({name:f.name,type:f.type||"unknown",bytes:f.size,sha256:await P.sha256File(f),userSupplied:true});renderRefs();$("refs").value=""};
function renderRefs(){const e=$("ref-list");e.replaceChildren();refs.forEach(r=>{const d=document.createElement("div");d.className="fx-card";d.innerHTML=`<strong>${esc(r.name)}</strong><div class="pg-hash">${r.sha256}</div>`;e.append(d)});$("ref-count").textContent=refs.length}
$("random-seed").onclick=()=>{$("seed").value=P.seed()};
async function build(){
 const prompt=$("prompt").value.trim(),negative=$("negative").value.trim(),seed=+$("seed").value||0,style=$("style").value,model=$("model").value.trim(),scheduler=$("scheduler").value,steps=Math.max(1,+$("steps").value||30),guidance=Math.max(0,+$("guidance").value||7),width=+$("width").value,height=+$("height").value;
 const fingerprint=await P.sha256Text(JSON.stringify({prompt,negative,seed,style,model,scheduler,steps,guidance,width,height,refs:refs.map(r=>r.sha256)}));
 job={schema:"zzx.portraitgen.job.v1",created:new Date().toISOString(),prompt,negativePrompt:negative,seed,styleLock:style,model,scheduler,steps,guidance,width,height,referenceAssets:refs,provenance:{jobFingerprint:fingerprint,userProvidedPrompt:true,referenceAssetsUserSupplied:true},execution:{browserInference:false,nativeAdapter:"diffusers/torch",status:"planned"}};
 $("job-output").textContent=JSON.stringify(job,null,2);$("fingerprint").textContent=fingerprint;renderCard()
}
function renderCard(){
 const p=job||{prompt:"Build a job first.",seed:0,styleLock:"—",model:"—",provenance:{jobFingerprint:"—"}};
 $("preview-prompt").textContent=p.prompt;$("preview-seed").textContent=`seed ${p.seed}`;$("preview-style").textContent=`${p.styleLock} · ${p.model}`;$("preview-hash").textContent=p.provenance.jobFingerprint
}
$("build").onclick=build;
$("export").onclick=async()=>{if(!job)await build();P.download(JSON.stringify(job,null,2),"portraitgen-job.json")};
$("copy-cli").onclick=async()=>{if(!job)await build();const cmd=`python portraitgen.py --model ${JSON.stringify(job.model)} --prompt ${JSON.stringify(job.prompt)} --negative ${JSON.stringify(job.negativePrompt)} --seed ${job.seed} --steps ${job.steps} --guidance ${job.guidance} --width ${job.width} --height ${job.height}`;await navigator.clipboard.writeText(cmd);$("cli-output").textContent=cmd};
$("random-seed").click();renderRefs();renderCard();window.PortraitGen=Object.freeze({version:"0.2.0-alpha-web",browserInference:false});
})();
