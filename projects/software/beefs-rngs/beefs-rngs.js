(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={latest:new Uint8Array(),pool:new Uint8Array(),audit:[]};

  function addAudit(type,data){state.audit.push({at:new Date().toISOString(),type,...data});renderAudit();}
  function renderAudit(){$("audit-log").textContent=JSON.stringify(state.audit,null,2);}
  function download(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function genRandom() {
    const bytes=BeefRNGCore.randomBytes($("random-count").value);
    state.latest=bytes;
    const out=$("random-format").value==="base64"?BeefRNGCore.base64(bytes):BeefRNGCore.hex(bytes);
    $("random-output").textContent=out;
    addAudit("webcrypto",{label:$("random-label").value,count:bytes.length,sha256:"pending"});
    BeefRNGCore.sha256(bytes).then(h=>{state.audit.at(-1).sha256=BeefRNGCore.hex(h);renderAudit();});
  }

  async function mixEntropy(files=[]) {
    const parts=[state.pool,new TextEncoder().encode($("entropy-text").value),BeefRNGCore.randomBytes(32)];
    const fileInfo=[];
    for(const f of files) {
      const bytes=new Uint8Array(await f.arrayBuffer());
      const h=await BeefRNGCore.sha256(bytes);
      parts.push(h);
      fileInfo.push({name:f.name,bytes:f.size,sha256:BeefRNGCore.hex(h)});
    }
    const total=parts.reduce((s,p)=>s+p.length,0),combined=new Uint8Array(total);let o=0;for(const p of parts){combined.set(p,o);o+=p.length;}
    state.pool=await BeefRNGCore.sha256(combined);
    $("entropy-output").textContent=JSON.stringify({poolSha256:BeefRNGCore.hex(state.pool),files:fileInfo,textBytes:new TextEncoder().encode($("entropy-text").value).length,freshWebCryptoBytes:32},null,2);
    addAudit("entropy-mix",{poolSha256:BeefRNGCore.hex(state.pool),files:fileInfo.length});
  }

  async function det() {
    const bytes=await BeefRNGCore.hmacStream($("det-seed").value,$("det-context").value,$("det-count").value);
    state.latest=bytes;
    $("det-output").textContent=BeefRNGCore.hex(bytes);
    addAudit("deterministic-hmac",{bytes:bytes.length,seedLabel:$("det-seed").value,context:$("det-context").value,sha256:BeefRNGCore.hex(await BeefRNGCore.sha256(bytes))});
  }

  function tests() {
    const bytes=BeefRNGCore.fromHex($("test-input").value);
    const result=BeefRNGTests.all(bytes);
    $("test-output").textContent=JSON.stringify(result,null,2);
    addAudit("bias-tests",{bytes:bytes.length,result});
  }

  async function vectors() {
    const specs=[["beef","vector-1"],["beef","vector-2"],["offline-seed","audit"],["000000","zero-context"]];
    const body=$("vector-body");body.replaceChildren();
    for(const [seed,ctx] of specs) {
      const bytes=await BeefRNGCore.hmacStream(seed,ctx,32);
      const tr=document.createElement("tr");
      [seed,ctx,BeefRNGCore.hex(bytes)].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
      body.appendChild(tr);
    }
  }

  const dz=$("entropy-drop");
  ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("dragover");}));
  ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("dragover");}));
  dz.addEventListener("drop",e=>mixEntropy([...e.dataTransfer.files]).catch(err=>$("entropy-output").textContent=`ERROR: ${err.message}`));

  $("random-run").addEventListener("click",genRandom);
  $("random-copy").addEventListener("click",()=>navigator.clipboard?.writeText($("random-output").textContent));
  $("entropy-files").addEventListener("change",async()=>{await mixEntropy([...$("entropy-files").files]);$("entropy-files").value="";});
  $("entropy-mix").addEventListener("click",()=>mixEntropy([]).catch(err=>$("entropy-output").textContent=`ERROR: ${err.message}`));
  $("entropy-clear").addEventListener("click",()=>{state.pool=new Uint8Array();$("entropy-output").textContent="Entropy pool cleared.";addAudit("entropy-clear",{});});
  $("det-run").addEventListener("click",()=>det().catch(err=>$("det-output").textContent=`ERROR: ${err.message}`));
  $("test-use-latest").addEventListener("click",()=>{$("test-input").value=BeefRNGCore.hex(state.latest);});
  $("test-run").addEventListener("click",()=>{try{tests();}catch(e){$("test-output").textContent=`ERROR: ${e.message}`;}});
  $("audit-export").addEventListener("click",()=>download(JSON.stringify({schema:"zzx.beefs-rngs.audit.v1",events:state.audit},null,2),`beefs-rngs-audit-${Date.now()}.json`));
  $("audit-clear").addEventListener("click",()=>{state.audit=[];renderAudit();});
  genRandom();vectors();renderAudit();

  window.BeefsRNGs=Object.freeze({version:"0.2.0-alpha-web",randomBytes:BeefRNGCore.randomBytes,hmacStream:BeefRNGCore.hmacStream,test:BeefRNGTests.all,getAudit:()=>JSON.parse(JSON.stringify(state.audit)),getState:()=>({latestBytes:state.latest.length,pool:BeefRNGCore.hex(state.pool),auditEvents:state.audit.length})});
  window.ZZXHooks?.emit("beefs-rngs:ready",{version:"0.2.0-alpha-web"});
})();
