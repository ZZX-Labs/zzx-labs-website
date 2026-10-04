(()=>{"use strict";
const $=id=>document.getElementById(id);
let files=[],plan=null;
const profiles=Object.freeze({"redpanda":{"title":"RedPanda","region":"PRC / China","code":"CN","route":"/projects/software/t4np/redpanda/"},"amurtiger":{"title":"AmurTiger","region":"Russia","code":"RU","route":"/projects/software/t4np/amurtiger/"},"manchuriantiger":{"title":"ManchurianTiger","region":"DPRK / North Korea","code":"KP","route":"/projects/software/t4np/manchuriantiger/"},"persianleopard":{"title":"PersianLeopard","region":"Iran","code":"IR","route":"/projects/software/t4np/persianleopard/"},"nubianibex":{"title":"NubianIbex","region":"Israel","code":"IL","route":"/projects/software/t4np/nubianibex/"},"markhorsheep":{"title":"MarkhorSheep","region":"Pakistan","code":"PK","route":"/projects/software/t4np/markhorsheep/"},"arabianleopard":{"title":"ArabianLeopard","region":"Saudi Arabia","code":"SA","route":"/projects/software/t4np/arabianleopard/"},"westafricanlion":{"title":"WestAfricanLion","region":"Nigeria","code":"NG","route":"/projects/software/t4np/westafricanlion/"}});
const family=Object.freeze({"schema":"zzx.t4np.family.v2","root":"/projects/software/t4np/","modules":[{"slug":"redpanda","title":"RedPanda","jurisdiction":"PRC / China","country_code":"CN","href":"/projects/software/t4np/redpanda/"},{"slug":"amurtiger","title":"AmurTiger","jurisdiction":"Russia","country_code":"RU","href":"/projects/software/t4np/amurtiger/"},{"slug":"manchuriantiger","title":"ManchurianTiger","jurisdiction":"DPRK / North Korea","country_code":"KP","href":"/projects/software/t4np/manchuriantiger/"},{"slug":"persianleopard","title":"PersianLeopard","jurisdiction":"Iran","country_code":"IR","href":"/projects/software/t4np/persianleopard/"},{"slug":"nubianibex","title":"NubianIbex","jurisdiction":"Israel","country_code":"IL","href":"/projects/software/t4np/nubianibex/"},{"slug":"markhorsheep","title":"MarkhorSheep","jurisdiction":"Pakistan","country_code":"PK","href":"/projects/software/t4np/markhorsheep/"},{"slug":"arabianleopard","title":"ArabianLeopard","jurisdiction":"Saudi Arabia","country_code":"SA","href":"/projects/software/t4np/arabianleopard/"},{"slug":"westafricanlion","title":"WestAfricanLion","jurisdiction":"Nigeria","country_code":"NG","href":"/projects/software/t4np/westafricanlion/"}],"candidate_not_included":{"jurisdiction":"Syria","reason":"user marked uncertain and no prior codename was recoverable"},"scope":"transparent defensive release controls, provenance, checksum manifests, license gates, and build-policy enforcement","destructive_actions":false,"remote_execution":false,"credential_collection":false});
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");

async function sha256File(f){
 return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))
}

$("source").onchange=async()=>{
 files=[];
 for(const f of [...$("source").files]){
  files.push({name:f.name,bytes:f.size,type:f.type||"unknown",sha256:await sha256File(f)})
 }
 renderFiles();
 $("source").value=""
};

function renderFiles(){
 const tb=$("file-body");
 tb.replaceChildren();
 files.forEach(f=>{
  const tr=document.createElement("tr");
  tr.innerHTML=`<td>${escapeHTML(f.name)}</td><td>${f.bytes}</td><td>${f.sha256}</td>`;
  tb.append(tr)
 });
 $("file-count").textContent=files.length;
 $("bytes").textContent=files.reduce((s,f)=>s+f.bytes,0).toLocaleString()
}

function escapeHTML(s){
 return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))
}

function selectedProfile(){
 return profiles[$("profile").value]
}

$("build").onclick=()=>{
 const profile=selectedProfile();
 plan={
  schema:"zzx.t4np.protection-plan.v2",
  familySchema:family.schema,
  created:new Date().toISOString(),
  project:$("project").value.trim(),
  profile:$("profile").value,
  jurisdiction:profile,
  sourceFiles:files,
  protections:{
   signedReviewedManifest:$("signed-manifest").checked,
   checksums:$("checksums").checked,
   licenseGate:$("license-gate").checked,
   buildGuard:$("build-guard").checked,
   provenanceBanner:$("provenance").checked,
   distributionDenyMarker:$("deny-marker").checked,
   humanReview:$("human-review").checked,
   failClosed:$("fail-closed").checked
  },
  enforcementModel:"transparent defensive release controls and provenance",
  arbitraryCodeExecution:false,
  remoteAccess:false,
  credentialCollection:false,
  destructiveAction:false,
  hiddenPayload:false
 };
 $("output").textContent=JSON.stringify(plan,null,2);
 renderGuards()
};

function renderGuards(){
 const e=$("guards");
 e.replaceChildren();
 const p=plan?.protections||{};
 const rows=[
  ["Cryptographic manifest",p.signedReviewedManifest||p.checksums?"enabled":"disabled","Hash/provenance records for release contents."],
  ["License gate",p.licenseGate?"enabled":"disabled","Release policy can stop unsupported distribution targets."],
  ["Build guard",p.buildGuard?"enabled":"disabled","Release tooling can fail closed when policy conditions are not met."],
  ["Provenance banner",p.provenanceBanner?"enabled":"disabled","Carries ownership and release-policy metadata."],
  ["Distribution marker",p.distributionDenyMarker?"enabled":"disabled","Machine-readable policy marker; not hidden or self-modifying."],
  ["Human review",p.humanReview?"required":"optional","Requires explicit operator approval before release."],
  ["Fail closed",p.failClosed?"enabled":"disabled","Missing/invalid release-policy data blocks the release plan."]
 ];
 rows.forEach(([a,b,c])=>{
  const d=document.createElement("div");
  d.className="guard-row";
  d.innerHTML=`<strong>${a}: ${b}</strong><p>${c}</p>`;
  e.append(d)
 })
}

$("policy").onclick=()=>{
 const p=selectedProfile();
 const text=`# T4NP release policy
family_schema=${family.schema}
profile=${$("profile").value}
module_title=${p.title}
region=${p.region}
country_code=${p.code}
route=${p.route}
policy=deny-distribution
mode=defensive-release-control
human_review=${$("human-review").checked}
fail_closed=${$("fail-closed").checked}

# Declarative policy only.
# No remote execution, credential collection, destructive source mutation,
# hidden payload, persistence, or security-control bypass.
`;
 $("policy-output").textContent=text
};

function renderFamily(){
 const grid=$("module-grid");
 grid.replaceChildren();
 family.modules.forEach(m=>{
  const d=document.createElement("article");
  d.className="module-card";
  d.innerHTML=`
   <h3>${escapeHTML(m.title)}</h3>
   <div class="module-meta">${escapeHTML(m.jurisdiction)} · ${escapeHTML(m.country_code)}</div>
   <div class="module-route"><code>${escapeHTML(m.href)}</code></div>
   <div class="module-actions"><a href="${m.href}">OPEN MODULE</a></div>`;
  grid.append(d)
 });
 $("module-count").textContent=family.modules.length;
 $("country-count").textContent=new Set(family.modules.map(m=>m.country_code)).size;
 $("family-schema").textContent=family.schema;
 $("candidate").textContent=family.candidate_not_included
  ? `${family.candidate_not_included.jurisdiction} — ${family.candidate_not_included.reason}`
  : "none";
}

$("export").onclick=()=>{
 if(!plan)$("build").click();
 const payload={
  ...plan,
  family:{
   schema:family.schema,
   root:family.root,
   modules:family.modules,
   candidate_not_included:family.candidate_not_included
  }
 };
 const t=JSON.stringify(payload,null,2),
       b=new Blob([t],{type:"application/json"}),
       u=URL.createObjectURL(b),
       a=document.createElement("a");
 a.href=u;
 a.download="t4np-protection-plan.json";
 a.click();
 setTimeout(()=>URL.revokeObjectURL(u),800)
};

$("open-module").onclick=()=>{
 const p=selectedProfile();
 location.href=p.route
};

renderFiles();
renderFamily();
$("build").click();
window.T4NP=Object.freeze({
 version:"0.1.0-alpha-web",
 familySchema:family.schema,
 moduleCount:family.modules.length,
 profiles,
 destructive:false,
 remoteAccess:false,
 credentialCollection:false
});
})();
