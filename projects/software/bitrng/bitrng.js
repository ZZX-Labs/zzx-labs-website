(() => {
  "use strict";
  const $=id=>document.getElementById(id),DEFAULT="https://mempool.space/api";
  const state={api:localStorage.getItem("zzx-bitrng-api")||DEFAULT,collection:null,seed:null,latest:new Uint8Array(),audit:[]};

  function log(type,data={}){state.audit.push({at:new Date().toISOString(),type,...data});renderAudit();}
  function status(t,k){const e=$("rng-net");e.textContent=t;e.className=`runtime-badge ${k}`;}
  function download(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function fetchText(path){const r=await fetch(`${state.api}${path}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return(await r.text()).trim();}
  async function fetchJson(path){const r=await fetch(`${state.api}${path}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}

  async function collect(){
    status("BITCOIN: FETCHING","partial");
    try{
      const n=Math.max(1,Math.min(25,Number($("rc-blocks").value)||6)),probes=Math.max(1,Math.min(25,Number($("rc-probes").value)||8));
      const tip=Number(await fetchText("/blocks/tip/height")),blocks=[],txids=[],latencies=[];
      for(let h=tip;h>tip-n;h--){
        const hash=await fetchText(`/block-height/${h}`);blocks.push({height:h,hash});
        try{const txs=await fetchJson(`/block/${hash}/txids`);if(Array.isArray(txs))txids.push(...txs.slice(0,4));}catch{}
      }
      for(let i=0;i<probes;i++){const t=performance.now();await fetchText("/blocks/tip/height");latencies.push(performance.now()-t);}
      const secret=BitRNGCore.randomBytes(Math.max(32,Math.min(4096,Number($("rc-bytes").value)||64)));
      state.collection={tip,blocks,txids,latencies,publicFingerprint:await BitRNGCore.sha256HexText(JSON.stringify({blocks,txids,latencies:latencies.map(x=>Number(x.toFixed(3))) }))};
      state._secret=secret;
      $("rc-block-count").textContent=blocks.length;$("rc-tx-count").textContent=txids.length;$("rc-lat-count").textContent=latencies.length;$("rc-rng-count").textContent=secret.length;
      $("rc-output").textContent=JSON.stringify(state.collection,null,2);status("BITCOIN: READY","ok");log("collect",{tip,blocks:blocks.length,txids:txids.length,latencies:latencies.length,secretBytes:secret.length,publicFingerprint:state.collection.publicFingerprint});
    }catch(e){status("BITCOIN: ERROR","bad");$("rc-output").textContent=`ERROR: ${e.message}`;throw e;}
  }

  async function mix(){
    if(!state.collection||!state._secret)throw new Error("Collect entropy first.");
    const context=$("mix-context").value,publicCanonical=JSON.stringify({context,collection:state.collection});
    const publicHash=await BitRNGCore.sha256(new TextEncoder().encode(publicCanonical));
    const combined=new Uint8Array(publicHash.length+state._secret.length);combined.set(publicHash);combined.set(state._secret,publicHash.length);
    state.seed=BitRNGCore.hex(await BitRNGCore.sha256(combined));
    $("mix-output").textContent=JSON.stringify({seed256Hex:state.seed,publicFingerprint:state.collection.publicFingerprint,context,secretContributionBytes:state._secret.length},null,2);
    log("seed-derived",{seedFingerprint:(await BitRNGCore.sha256HexText(state.seed)).slice(0,32),publicFingerprint:state.collection.publicFingerprint,context});
  }

  async function generate(){
    let bytes;
    const count=Math.max(1,Math.min(65536,Number($("ro-count").value)||64));
    if($("ro-mode").value==="webcrypto")bytes=BitRNGCore.randomBytes(count);
    else{if(!state.seed)throw new Error("Derive a mixed seed first.");bytes=await BitRNGCore.hmacStream(state.seed,"bitrng-output",count);}
    state.latest=bytes;const out=$("ro-format").value==="base64"?BitRNGCore.base64(bytes):BitRNGCore.hex(bytes);$("ro-output").textContent=out;log("random-output",{mode:$("ro-mode").value,bytes:bytes.length,sha256:BitRNGCore.hex(await BitRNGCore.sha256(bytes))});
  }

  function test(){const b=BitRNGCore.fromHex($("rt-input").value),r=BitRNGCore.tests(b);$("rt-output").textContent=JSON.stringify(r,null,2);log("tests",{result:r});}
  function renderAudit(){$("ra-output").textContent=JSON.stringify(state.audit,null,2);}

  $("rs-api").value=state.api;$("rs-output").textContent=JSON.stringify({api:state.api},null,2);
  $("rc-run").addEventListener("click",()=>collect().catch(()=>{}));$("mix-run").addEventListener("click",()=>mix().catch(e=>$("mix-output").textContent=`ERROR: ${e.message}`));$("mix-copy").addEventListener("click",()=>navigator.clipboard?.writeText(state.seed||""));
  $("ro-run").addEventListener("click",()=>generate().catch(e=>$("ro-output").textContent=`ERROR: ${e.message}`));$("ro-copy").addEventListener("click",()=>navigator.clipboard?.writeText($("ro-output").textContent));
  $("rt-latest").addEventListener("click",()=>{$("rt-input").value=BitRNGCore.hex(state.latest);});$("rt-run").addEventListener("click",()=>{try{test();}catch(e){$("rt-output").textContent=`ERROR: ${e.message}`;}});
  $("ra-export").addEventListener("click",()=>download(JSON.stringify({schema:"zzx.bitrng.audit.v1",events:state.audit},null,2),`bitrng-audit-${Date.now()}.json`));$("ra-clear").addEventListener("click",()=>{state.audit=[];renderAudit();});
  $("rs-save").addEventListener("click",()=>{state.api=$("rs-api").value.trim().replace(/\/+$/,"")||DEFAULT;localStorage.setItem("zzx-bitrng-api",state.api);$("rs-output").textContent=JSON.stringify({api:state.api},null,2);});$("rs-reset").addEventListener("click",()=>{state.api=DEFAULT;$("rs-api").value=DEFAULT;localStorage.removeItem("zzx-bitrng-api");$("rs-output").textContent=JSON.stringify({api:state.api},null,2);});
  renderAudit();

  window.BitRNG=Object.freeze({version:"0.1.0-alpha-web",collect,mix,randomBytes:BitRNGCore.randomBytes,hmacStream:BitRNGCore.hmacStream,tests:BitRNGCore.tests,getState:()=>({api:state.api,collected:Boolean(state.collection),seedReady:Boolean(state.seed),auditEvents:state.audit.length})});
  window.ZZXHooks?.emit("bitrng:ready",{version:"0.1.0-alpha-web"});
})();
