(()=>{"use strict";
const $=id=>document.getElementById(id),P=window.T4NP_PROFILE;
let files=[],plan=null;
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(f){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))}
$("files").onchange=async()=>{files=[];for(const f of [...$("files").files])files.push({name:f.name,bytes:f.size,sha256:await sha(f)});$("files").value="";render()};
function render(){const tb=$("body");tb.replaceChildren();files.forEach(f=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${f.name}</td><td>${f.bytes}</td><td>${f.sha256}</td>`;tb.append(tr)});$("count").textContent=files.length;$("bytes").textContent=files.reduce((s,f)=>s+f.bytes,0).toLocaleString()}
$("build").onclick=()=>{
 plan={schema:"zzx.t4np.module-policy.v2",module:P.slug,title:P.title,jurisdiction:P.jurisdiction,countryCode:P.code,created:new Date().toISOString(),release:$("release").value.trim(),owner:$("owner").value.trim(),spdx:$("spdx").value.trim(),files,
 controls:{denyDistribution:$("deny").checked,checksumManifest:$("checksum").checked,provenance:$("provenance").checked,licenseGate:$("license").checked,failClosed:$("fail").checked,reviewRequired:$("review").checked},
 legalPolicyNotes:$("legal").value.trim(),deploymentNotes:$("notes").value.trim(),
 enforcementModel:"transparent defensive release-policy controls",
 destructiveAction:false,hiddenPayload:false,remoteExecution:false,credentialCollection:false};
 $("output").textContent=JSON.stringify(plan,null,2);
 const lines=[`# ${P.title} release policy`,`module=${P.slug}`,`jurisdiction=${P.jurisdiction}`,`country_code=${P.code}`,`release=${plan.release}`,`deny_distribution=${plan.controls.denyDistribution}`,`checksums=${plan.controls.checksumManifest}`,`provenance=${plan.controls.provenance}`,`license_gate=${plan.controls.licenseGate}`,`fail_closed=${plan.controls.failClosed}`,`review_required=${plan.controls.reviewRequired}`,"","# Declarative defensive release policy only.","# No source sabotage, hidden payloads, credential collection, or remote execution."];
 $("policy").textContent=lines.join("\n")
};
$("export").onclick=()=>{if(!plan)$("build").click();const t=JSON.stringify(plan,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`${P.slug}-release-policy.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();$("build").click();window.T4NPModule=Object.freeze({slug:P.slug,defensive:true});
})();
