(()=>{"use strict";
const $=id=>document.getElementById(id);
let report=null;
const cryptoHex=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,"0")).join("");
function method(){
 const t=$("device-type").value,level=$("assurance").value;
 if(t==="nvme")return level==="high"?"NVMe Sanitize / Crypto Erase":"NVMe Format NVM secure erase";
 if(t==="ata")return level==="high"?"ATA SECURITY ERASE UNIT / enhanced where supported":"ATA Secure Erase";
 if(t==="ssd")return"Controller-native sanitize preferred; avoid overwrite-only assumptions";
 if(t==="hdd")return level==="high"?"Verified overwrite + optional cryptographic pre-encryption":"Single-pass full-disk overwrite + verification";
 return"Vendor/device-specific verified sanitation";
}
function build(){
 const size=Math.max(0,+$("size-gb").value||0),passes=Math.max(1,+$("passes").value||1),rate=Math.max(1,+$("rate-mbps").value||250);
 const seconds=size*1000/rate*passes;
 const m=method();
 report={schema:"zzx.magneta.plan.v1",created:new Date().toISOString(),device:{alias:$("alias").value.trim(),type:$("device-type").value,sizeGB:size,interface:$("interface").value},assurance:$("assurance").value,selectedMethod:m,overwritePasses:passes,estimatedSeconds:seconds,verification:$("verify").value,serialChallenge:cryptoHex(8),destructiveExecution:false};
 $("method").textContent=m;$("estimate").textContent=seconds?`${(seconds/60).toFixed(1)} min`:"—";$("challenge").textContent=report.serialChallenge;$("plan-output").textContent=JSON.stringify(report,null,2);
 renderSteps(report);
}
function renderSteps(r){
 const s=$("steps");s.replaceChildren();
 const steps=["Identify exact target device and record serial/model","Un-mount/eject filesystems and ensure target is not the boot/system disk","Confirm backups and legal/retention authorization","Run controller-native sanitize/secure erase where supported","Run verification appropriate to the media/method","Generate signed/hashable destruction report and retain audit evidence"];
 steps.forEach((x,i)=>{const d=document.createElement("div");d.className="mag-plan-step";d.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b><span>${x}</span>`;s.append(d)});
}
$("build-plan").onclick=build;
$("export-report").onclick=()=>{if(!report)build();const t=JSON.stringify(report,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="magneta-sanitization-plan.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("simulate-verify").onclick=()=>{if(!report)build();const checks=[["target identity",true],["method compatible",true],["filesystem unmounted",false],["pre-destruction backup confirmation",false],["post-sanitize read verification",false],["report hash",true]];$("verify-output").textContent=JSON.stringify({simulation:true,checks:checks.map(([name,complete])=>({name,complete})),note:"Browser cannot inspect or erase host storage. Native Magneta performs authorized device operations."},null,2)};
build();
window.Magneta=Object.freeze({version:"0.2.0-alpha-web",destructiveExecution:false});
})();
