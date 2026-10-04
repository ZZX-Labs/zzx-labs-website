(()=>{"use strict";
const $=id=>document.getElementById(id),S=SpeciedexShared;
let node=null,records=[],services=[];
function build(){
 const mode=$("mode").value;
 services=[
  {name:"taxonomy",enabled:$("svc-taxonomy").checked,port:+$("port-taxonomy").value||7801},
  {name:"inference",enabled:$("svc-inference").checked,port:+$("port-inference").value||7802},
  {name:"archive",enabled:$("svc-archive").checked,port:+$("port-archive").value||7803},
  {name:"grpc",enabled:$("svc-grpc").checked,port:+$("port-grpc").value||7804}
 ];
 node={schema:"zzx.speciedexcore.node-profile.v1",nodeId:$("node-id").value.trim()||S.uid(),mode,bind:$("bind").value,storage:$("storage").value.trim(),maxRecords:Math.max(100,+$("max-records").value||100000),services,records:records.length,remoteExecution:false,credentialsStored:false,created:new Date().toISOString()};
 $("node-output").textContent=JSON.stringify(node,null,2);renderServices()
}
function renderServices(){const e=$("services");e.replaceChildren();services.forEach(s=>{const d=document.createElement("div");d.className="core-service";d.innerHTML=`<strong>${s.enabled?"ON":"OFF"} · ${s.name}</strong><div class="fx-watermark">port ${s.port}</div>`;e.append(d)});$("svc-count").textContent=services.filter(s=>s.enabled).length}
$("build").onclick=build;
$("dataset").onchange=async()=>{const f=$("dataset").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.records||[]);records=arr.map(S.normalize).filter(r=>!S.rejectHuman(r));$("data-output").textContent=JSON.stringify({loaded:records.length,rejectedHomoSapiens:arr.length-records.length},null,2);$("record-count").textContent=records.length;build()}catch(e){$("data-output").textContent="IMPORT ERROR: "+e.message}$("dataset").value=""};
$("query").onclick=()=>{const q=$("q").value.trim().toLowerCase(),hits=records.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q)).slice(0,100);$("query-output").textContent=JSON.stringify({query:q,hits},null,2)};
$("health").onclick=()=>{if(!node)build();$("health-output").textContent=JSON.stringify({nodeId:node.nodeId,mode:node.mode,records:records.length,services:services.map(s=>({name:s.name,configured:s.enabled,port:s.port,status:s.enabled?"configured":"disabled"})),runtime:"browser reference only",networkListenersOpened:false},null,2)};
$("export").onclick=()=>{if(!node)build();S.download(JSON.stringify({node,records},null,2),"speciedexcore-node-profile.json")};
$("node-id").value="speciedex-node-"+Math.random().toString(36).slice(2,8);build();window.SpeciedexCore=Object.freeze({version:"0.4.0-alpha-web",opensListeners:false});
})();
