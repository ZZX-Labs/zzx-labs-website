(() => {
  "use strict";
  const $=id=>document.getElementById(id),state={envelope:null};
  function randomHex(n=32){return EMIGNACore.hex(crypto.getRandomValues(new Uint8Array(n)));}
  function rotors(seed,count){if(!seed)throw new Error("EMIGNA seed required.");return EMIGNACore.buildConfig(seed,Math.max(1,Math.min(12,+count||4)));}
  function download(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function encrypt(){
    const plain=$("be-plain").value,seed=$("be-seed").value,count=Math.max(1,Math.min(12,+$("be-count").value||4)),rs=rotors(seed,count),stage=EMIGNACore.transform(EMIGNACore.utf8(plain),rs,false);
    const meta={rotorCount:count,emignaSeedFingerprint:EMIGNACore.sha3Hex(seed),plaintextSha3:EMIGNACore.sha3Hex(plain),rotorOutputSha3:EMIGNACore.sha3Hex(stage)};
    state.envelope=await BEESCrypto.encrypt(stage,$("be-pass").value,meta);
    $("be-output").textContent=JSON.stringify({...state.envelope,ciphertext:`${state.envelope.ciphertext.slice(0,72)}…`},null,2);
    $("bd-envelope").value=JSON.stringify(state.envelope,null,2);
    $("bd-seed").value=seed;
  }
  async function decrypt(){
    const env=JSON.parse($("bd-envelope").value),seed=$("bd-seed").value,stage=await BEESCrypto.decrypt(env,$("bd-pass").value),rs=rotors(seed,env.meta.rotorCount),plain=EMIGNACore.text(EMIGNACore.transform(stage,rs,true)),hash=EMIGNACore.sha3Hex(plain);
    $("bd-output").textContent=JSON.stringify({authenticated:true,plaintextSha3:hash,hashMatches:hash===env.meta.plaintextSha3,plaintext:plain},null,2);
  }
  $("be-random").addEventListener("click",()=>{$("be-seed").value=randomHex();});
  $("be-encrypt").addEventListener("click",()=>encrypt().catch(e=>$("be-output").textContent=`ERROR: ${e.message}`));
  $("be-export").addEventListener("click",()=>{if(state.envelope)download(JSON.stringify(state.envelope,null,2),`bees-envelope-${Date.now()}.json`);});
  $("bd-run").addEventListener("click",()=>decrypt().catch(e=>$("bd-output").textContent=`ERROR: ${e.message}`));
  $("br-inspect").addEventListener("click",()=>{try{const rs=rotors($("be-seed").value,$("be-count").value);$("br-output").textContent=JSON.stringify(rs.map(r=>({id:r.id,notch:r.notch,offset:r.offset,wiringSha3:EMIGNACore.sha3Hex(Uint8Array.from(r.wiring))})),null,2);}catch(e){$("br-output").textContent=`ERROR: ${e.message}`;}});
  $("bw-build").addEventListener("click",()=>{$("be-plain").value=JSON.stringify({schema:"zzx.bees.bitcoin-record.v1",type:$("bw-type").value,network:$("bw-net").value,label:$("bw-label").value,data:$("bw-data").value},null,2);});
  $("ba-sha3").addEventListener("click",()=>{$("ba-output").textContent=JSON.stringify({sha3_256:EMIGNACore.sha3Hex($("be-plain").value)},null,2);});
  $("ba-selftest").addEventListener("click",()=>{const seed="self-test",rs=EMIGNACore.buildConfig(seed,4),p=EMIGNACore.utf8("BEES self test"),c=EMIGNACore.transform(p,rs,false),r=EMIGNACore.transform(c,rs,true);$("ba-output").textContent=JSON.stringify({sha3Empty:EMIGNACore.sha3Hex(""),expectedSha3Empty:"a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",rotorRoundTrip:EMIGNACore.text(r)==="BEES self test"},null,2);});
  $("be-seed").value=randomHex();
  window.BEES=Object.freeze({version:"0.1.0-alpha-web",sha3:EMIGNACore.sha3Hex,buildRotors:EMIGNACore.buildConfig,rotorTransform:EMIGNACore.transform,encrypt:BEESCrypto.encrypt,decrypt:BEESCrypto.decrypt});
  window.ZZXHooks?.emit("bitcoinees:ready",{version:"0.1.0-alpha-web"});
})();
