(()=>{"use strict";
const $=id=>document.getElementById(id);
let files=[],plan=null;
const profiles={
 redpanda:{region:"PRC / China",code:"CN",route:"/projects/software/t4np/redpanda/"},
 amurtiger:{region:"Russia",code:"RU",route:"/projects/software/t4np/amurtiger/"},
 manchuriantiger:{region:"DPRK / North Korea",code:"KP",route:"/projects/software/t4np/manchuriantiger/"},
 persianleopard:{region:"Iran",code:"IR",route:"/projects/software/t4np/persianleopard/"}
};
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256File(f){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))}
$("source").onchange=async()=>{
 files=[];
 for(const f of [...$("source").files])files.push({name:f.name,bytes:f.size,type:f.type||"unknown",sha256:await sha256File(f)});
 renderFiles();$("source").value=""
};
function renderFiles(){
 const tb=$("file-body");tb.replaceChildren();
 files.forEach(f=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${f.name}</td><td>${f.bytes}</td><td>${f.sha256}</td>`;tb.append(tr)});
 $("file-count").textContent=files.length;$("bytes").textContent=files.reduce((s,f)=>s+f.bytes,0).toLocaleString()
}
$("build").onclick=()=>{
 const profile=profiles[$("profile").value];
 plan={
  schema:"zzx.t4np.protection-plan.v1",
  created:new Date().toISOString(),
  project:$("project").value.trim(),
  profile:$("profile").value,
  jurisdiction:profile,
  sourceFiles:files,
  protections:{
   signedManifest:$("signed-manifest").checked,
   checksums:$("checksums").checked,
   licenseGate:$("license-gate").checked,
   buildGuard:$("build-guard").checked,
   provenanceBanner:$("provenance").checked,
   distributionDenyMarker:$("deny-marker").checked
  },
  enforcementModel:"defensive distribution controls and provenance",
  arbitraryCodeExecution:false,
  remoteAccess:false,
  credentialCollection:false,
  destructiveAction:false
 };
 $("output").textContent=JSON.stringify(plan,null,2);renderGuards()
};
function renderGuards(){
 const e=$("guards");e.replaceChildren();
 const p=plan?.protections||{};
 const rows=[
  ["Cryptographic manifest",p.signedManifest||p.checksums?"enabled":"disabled","Hash/provenance records for release contents."],
  ["License gate",p.licenseGate?"enabled":"disabled","Build/release policy can stop unsupported distribution targets."],
  ["Build guard",p.buildGuard?"enabled":"disabled","Fails closed when a prohibited release profile is selected."],
  ["Provenance banner",p.provenanceBanner?"enabled":"disabled","Embeds project ownership and distribution-policy metadata."],
  ["Distribution deny marker",p.distributionDenyMarker?"enabled":"disabled","Machine-readable policy marker; not hidden or self-modifying."]
 ];
 rows.forEach(([a,b,c])=>{const d=document.createElement("div");d.className="guard-row";d.innerHTML=`<strong>${a}: ${b}</strong><p>${c}</p>`;e.append(d)})
}
$("policy").onclick=()=>{
 const p=profiles[$("profile").value];
 const text=`# T4NP release policy\nprofile=${$("profile").value}\nregion=${p.region}\ncountry_code=${p.code}\npolicy=deny-distribution\nmode=defensive-release-control\n\n# This policy is declarative. It does not execute remote actions,\n# damage source, or bypass host security.\n`;
 $("policy-output").textContent=text
};
$("export").onclick=()=>{
 if(!plan)$("build").click();
 const t=JSON.stringify(plan,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="t4np-protection-plan.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)
};
renderFiles();$("build").click();
window.T4NP=Object.freeze({version:"0.1.0-alpha-web",destructive:false,remoteAccess:false});
})();
