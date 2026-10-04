(()=>{"use strict";
const $=id=>document.getElementById(id);let last=null;
async function bench(){
 const rounds=Math.max(1000,Math.min(500000,+$("rounds").value||50000)),batch=Math.max(1,Math.min(4096,+$("batch").value||256)),seed=$("seed").value||"synthetic-benchmark";
 const enc=new TextEncoder(),start=performance.now();let digest=new Uint8Array(32),done=0;
 while(done<rounds){const n=Math.min(batch,rounds-done);for(let i=0;i<n;i++){const b=new Uint8Array(enc.encode(seed+":"+(done+i)));digest=new Uint8Array(await crypto.subtle.digest("SHA-256",b))}done+=n;$("progress").style.width=(done/rounds*100).toFixed(1)+"%";await new Promise(r=>setTimeout(r,0))}
 const ms=performance.now()-start,rate=rounds/(ms/1000);last={schema:"zzx.shaka-kahn.synthetic-benchmark.v1",rounds,batch,ms,opsPerSecond:rate,backend:"WebCrypto SHA-256 CPU/browser",targetSecret:false,targetHash:false,credentialTesting:false,distributed:false,digest:[...digest].map(x=>x.toString(16).padStart(2,"0")).join("")};
 $("ops").textContent=Math.round(rate).toLocaleString();$("ms").textContent=ms.toFixed(1);$("output").textContent=JSON.stringify(last,null,2)
}
$("bench").onclick=bench;
$("estimate").onclick=()=>{const bits=Math.max(1,Math.min(128,+$("bits").value||32)),rate=Math.max(1,+$("rate").value||1e9),space=2**Math.min(bits,53),seconds=space/rate,years=seconds/31557600;$("estimate-output").textContent=JSON.stringify({bits,keyspace:bits<=53?space:`2^${bits}`,assumedOpsPerSecond:rate,fullSweepSeconds:bits<=53?seconds:`~2^${bits}/rate`,fullSweepYears:bits<=53?years:null,note:"synthetic keyspace sizing only; no target cracking"},null,2)};
$("export").onclick=()=>{if(!last)return;const t=JSON.stringify(last,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="shaka-kahn-benchmark.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.ShakaKahn=Object.freeze({version:"0.2.0-internal-web",credentialTesting:false,targetCracking:false});
})();
