(()=>{"use strict";
const $=id=>document.getElementById(id);
const PROFILE=window.T4NP_PROFILE;
let files=[],plan=null;
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(f){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))}
$("files").onchange=async()=>{files=[];for(const f of [...$("files").files])files.push({name:f.name,bytes:f.size,sha256:await sha(f)});$("files").value="";render()};
function render(){const tb=$("body");tb.replaceChildren();files.forEach(f=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${f.name}</td><td>${f.bytes}</td><td>${f.sha256}</td>`;tb.append(tr)});$("count").textContent=files.length;$("bytes").textContent=files.reduce((s,f)=>s+f.bytes,0).toLocaleString()}
$("build").onclick=()=>{
 const release=$("release").value.trim(),owner=$("owner").value.trim(),spdx=$("spdx").value.trim(),policy={
  schema:"zzx.t4np.module-policy.v1",
  module:PROFILE.slug,
  region:PROFILE.region,
  countryCode:PROFILE.code,
  route:PROFILE.route,
  created:new Date().toISOString(),
  release,owner,spdx,
  files,
  controls:{
   releaseBlocked:$("block").checked,
   checksumManifest:$("checksum").checked,
   provenance:$("provenance").checked,
   buildFailClosed:$("failclosed").checked,
   explicitLicenseTerms:$("license").checked
  },
  mechanism:"transparent defensive release-policy enforcement",
  hiddenPayload:false,
  sourceDestruction:false,
  credentialCollection:false,
  remoteExecution:false
 };
 plan=policy;$("output").textContent=JSON.stringify(policy,null,2);
 const lines=[
  `# ${PROFILE.title} defensive release profile`,
  `module=${PROFILE.slug}`,
  `region=${PROFILE.region}`,
  `country_code=${PROFILE.code}`,
  `release=${release}`,
  `policy=${$("block").checked?"deny-distribution":"review-required"}`,
  `fail_closed=${$("failclosed").checked?"true":"false"}`,
  `checksums=${$("checksum").checked?"required":"optional"}`,
  `provenance=${$("provenance").checked?"required":"optional"}`,
  "",
  "# Declarative policy only. No source sabotage, covert payloads,",
  "# credential collection, or remote execution."
 ];
 $("policy").textContent=lines.join("\n")
};
$("export").onclick=()=>{if(!plan)$("build").click();const t=JSON.stringify(plan,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`${PROFILE.slug}-release-policy.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();$("build").click();window.T4NPModule=Object.freeze({slug:PROFILE.slug,defensive:true});
})();
