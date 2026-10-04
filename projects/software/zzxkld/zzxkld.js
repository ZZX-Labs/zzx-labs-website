(()=>{"use strict";const $=id=>document.getElementById(id);let findings=[],events=[];
function add(sev,name,detail){findings.push({severity:sev,name,detail,at:new Date().toISOString()})}
function scan(){
 findings=[];
 const cfg={
   trustedProcesses:$("trusted").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),
   unknownHooks:+$("hooks").value||0,
   unsignedInputDrivers:+$("drivers").value||0,
   clipboardReaders:+$("clipboard").value||0,
   startupAnomalies:+$("startup").value||0,
   integrityMismatches:+$("integrity").value||0
 };
 if(cfg.unknownHooks)add("high","Unknown input hooks",`${cfg.unknownHooks} unrecognized hook indicator(s) in imported/manual inventory.`);
 if(cfg.unsignedInputDrivers)add("high","Unsigned input drivers",`${cfg.unsignedInputDrivers} unsigned/unverified input-driver indicator(s).`);
 if(cfg.clipboardReaders)add("medium","Unexpected clipboard readers",`${cfg.clipboardReaders} process indicator(s).`);
 if(cfg.startupAnomalies)add("medium","Startup persistence anomalies",`${cfg.startupAnomalies} suspicious startup entry indicator(s).`);
 if(cfg.integrityMismatches)add("high","Integrity mismatch",`${cfg.integrityMismatches} monitored component mismatch(es).`);
 if(!findings.length)add("info","No configured indicators","The current local/manual assessment contains no raised indicators.");
 render()
}
function render(){
 const e=$("findings");e.replaceChildren();findings.forEach(f=>{const d=document.createElement("div");d.className="kld-row";d.innerHTML=`<strong>${f.severity.toUpperCase()} · ${f.name}</strong><div>${f.detail}</div>`;e.append(d)});
 const weights={high:30,medium:15,low:5,info:0},risk=Math.min(100,findings.reduce((s,f)=>s+(weights[f.severity]||0),0));
 $("risk").textContent=risk;$("finding-count").textContent=findings.filter(f=>f.severity!=="info").length;$("mode").textContent="DEFENSIVE";$("capture").textContent="OFF"
}
$("scan").onclick=scan;
$("focus").addEventListener("keydown",e=>{events.push({at:new Date().toISOString(),event:"keydown",keyClass:e.key.length===1?"printable":"control",length:e.key.length});$("event-count").textContent=events.length;$("focus-out").textContent=`Observed ${events.length} keydown event(s) inside this explicit test box. Key values are not retained.`});
$("focus").addEventListener("input",()=>{$("focus").value=""});
$("clear-events").onclick=()=>{events=[];$("event-count").textContent=0;$("focus-out").textContent=""};
$("import").onchange=async()=>{const f=$("import").files[0];if(!f)return;try{const j=JSON.parse(await f.text());$("inventory-out").textContent=JSON.stringify(j,null,2)}catch(e){$("inventory-out").textContent="IMPORT ERROR: "+e.message}$("import").value=""};
$("policy").onclick=()=>{$("policy-out").textContent=JSON.stringify({schema:"zzx.kld.defense-policy.v1",created:new Date().toISOString(),controls:{screenLock:true,leastPrivilege:true,applicationAllowlisting:true,inputDriverVerification:true,startupIntegrityReview:true,endpointProtection:true,clipboardReview:true,auditLogging:true},globalKeystrokeCapture:false,keystrokeStorage:false,stealthHooks:false,credentialCollection:false},null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.kld.assessment.v1",exported:new Date().toISOString(),findings,defensiveOnly:true,keystrokesCaptured:false},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zzxkld-assessment.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
scan();window.ZZXKLD=Object.freeze({version:"0.1.0-alpha-web",globalCapture:false,credentialCollection:false});
})();
