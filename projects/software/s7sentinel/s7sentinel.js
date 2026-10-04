(()=>{"use strict";
const $=id=>document.getElementById(id);let inventory=[],events=[],findings=[];
function parseCSV(t){const ls=t.split(/\r?\n/).filter(x=>x.trim());if(ls.length<2)return[];const h=ls[0].split(",").map(x=>x.trim());return ls.slice(1).map(l=>{const v=l.split(",");const o={};h.forEach((k,i)=>o[k]=v[i]?.trim()??"");return o})}
function norm(r){return{asset:r.asset||r.name||"unknown",ip:r.ip||"",model:r.model||"",firmware:r.firmware||"",tcp102:/^(1|true|yes|open)$/i.test(String(r.tcp102||r.port102||"")),internetExposed:/^(1|true|yes)$/i.test(String(r.internetExposed||r.internet||"")),engineeringWorkstation:/^(1|true|yes)$/i.test(String(r.engineeringWorkstation||r.ews||"")),allowlist:/^(1|true|yes)$/i.test(String(r.allowlist||"")),backups:/^(1|true|yes)$/i.test(String(r.backups||"")),notes:r.notes||""}}
$("inventory-file").onchange=async()=>{const f=$("inventory-file").files[0];if(!f)return;inventory=parseCSV(await f.text()).map(norm);renderInventory();$("inventory-file").value=""};
$("sample").onclick=()=>{inventory=[
 {asset:"PLC-LAB-01",ip:"10.10.20.11",model:"S7-1500",firmware:"example",tcp102:true,internetExposed:false,engineeringWorkstation:false,allowlist:true,backups:true,notes:"synthetic"},
 {asset:"EWS-LAB-01",ip:"10.10.20.50",model:"engineering workstation",firmware:"n/a",tcp102:false,internetExposed:false,engineeringWorkstation:true,allowlist:false,backups:true,notes:"synthetic"},
 {asset:"PLC-LAB-02",ip:"10.10.30.12",model:"S7-1200",firmware:"example",tcp102:true,internetExposed:true,engineeringWorkstation:false,allowlist:false,backups:false,notes:"synthetic"}
 ];renderInventory()};
function renderInventory(){
 const tb=$("inv-body");tb.replaceChildren();inventory.forEach(a=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${a.asset}</td><td>${a.ip}</td><td>${a.model}</td><td>${a.tcp102?"yes":"no"}</td><td>${a.internetExposed?"yes":"no"}</td><td>${a.allowlist?"yes":"no"}</td><td>${a.backups?"yes":"no"}</td>`;tb.append(tr)});
 $("assets").textContent=inventory.length;$("tcp102").textContent=inventory.filter(a=>a.tcp102).length;$("internet").textContent=inventory.filter(a=>a.internetExposed).length;$("ews").textContent=inventory.filter(a=>a.engineeringWorkstation).length
}
$("assess").onclick=()=>{
 findings=[];for(const a of inventory){
  if(a.internetExposed)findings.push({asset:a.asset,severity:"high",check:"internet-exposure",detail:"Asset marked Internet-exposed. Remove direct exposure; require controlled OT access path."});
  if(a.tcp102&&!a.allowlist)findings.push({asset:a.asset,severity:"medium",check:"tcp-102-access-control",detail:"S7comm/TCP 102 present without an allowlist flag in the supplied inventory."});
  if(!a.backups)findings.push({asset:a.asset,severity:"medium",check:"logic-backup",detail:"No known-good backup flag supplied."});
  if(a.engineeringWorkstation&&!a.allowlist)findings.push({asset:a.asset,severity:"medium",check:"engineering-workstation",detail:"Engineering workstation lacks an allowlist flag."});
 }
 renderFindings()
};
function renderFindings(){const e=$("findings");e.replaceChildren();findings.forEach(f=>{const d=document.createElement("div");d.className="s7-check";d.innerHTML=`<strong class="s7-risk-${f.severity==="high"?"high":f.severity==="medium"?"med":"low"}">${f.severity.toUpperCase()} · ${f.check}</strong><div>${f.asset}</div><p>${f.detail}</p>`;e.append(d)});$("finding-count").textContent=findings.length}
$("log-file").onchange=async()=>{const f=$("log-file").files[0];if(!f)return;const text=await f.text();events=text.split(/\r?\n/).filter(Boolean).slice(0,5000).map((line,i)=>({i,line,flags:[/stop|start|download|upload|write|block|error|auth|login|102/i.test(line)?"review":null].filter(Boolean)}));$("telemetry-output").textContent=JSON.stringify({lines:events.length,flagged:events.filter(e=>e.flags.length).slice(0,200)},null,2);$("log-file").value=""};
$("artifact-file").onchange=async()=>{const f=$("artifact-file").files[0];if(!f)return;const t=await f.text();const patterns=["python","powershell","s7","snap7","plc","tcp/102","censys","zoomeye","download","upload"];const hits=patterns.map(p=>({pattern:p,count:(t.toLowerCase().match(new RegExp(p.replace("/","\\/"),"g"))||[]).length})).filter(x=>x.count);$("artifact-output").textContent=JSON.stringify({file:f.name,hits,note:"local string-pattern review only; no execution"},null,2);$("artifact-file").value=""};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.s7sentinel.assessment.v1",generated:new Date().toISOString(),inventory,findings,telemetrySummary:{lines:events.length,flagged:events.filter(e=>e.flags.length).length},mode:"read-only",plcWrites:false,exploitExecution:false,credentialAttacks:false,internetScanning:false},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="s7sentinel-report.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("sample").click();window.S7Sentinel=Object.freeze({version:"0.3.0-web",readOnly:true});
})();
