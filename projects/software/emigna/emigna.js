(() => {
  "use strict";
  const $=id=>document.getElementById(id),state={rotors:null,lastHex:null};
  function currentRotors(){return state.rotors||EMIGNACore.buildConfig($("et-seed").value,Math.max(1,Math.min(12,+$("et-count").value||4)));}
  function validate(rs){if(!Array.isArray(rs)||!rs.length)throw new Error("Rotor array required.");for(const r of rs){if(!Array.isArray(r.wiring)||r.wiring.length!==256||new Set(r.wiring).size!==256||r.wiring.some(x=>x<0||x>255))throw new Error(`Invalid wiring for ${r.id||"rotor"}.`);r.offset=(+r.offset||0)&255;r.notch=(+r.notch||0)&255;}return rs;}
  function run(){
    const rs=currentRotors();
    if($("et-mode").value==="encrypt"){const out=EMIGNACore.transform(EMIGNACore.utf8($("et-input").value),rs,false);state.lastHex=EMIGNACore.hex(out);$("et-output").textContent=JSON.stringify({hex:state.lastHex,sha3:EMIGNACore.sha3Hex(out),bytes:out.length},null,2);}
    else{const out=EMIGNACore.transform(EMIGNACore.unhex($("et-input").value),rs,true);$("et-output").textContent=JSON.stringify({text:EMIGNACore.text(out),sha3:EMIGNACore.sha3Hex(out)},null,2);}
  }
  function renderRotors(){const root=$("er-list");root.replaceChildren();for(const r of currentRotors()){const e=document.createElement("article");e.className="z-list-item";e.innerHTML="<strong></strong><p></p>";e.querySelector("strong").textContent=`${r.id} · notch ${r.notch} · offset ${r.offset}`;e.querySelector("p").textContent=`wiring SHA3 ${EMIGNACore.sha3Hex(Uint8Array.from(r.wiring))}`;root.appendChild(e);}$("ec-json").value=JSON.stringify(currentRotors(),null,2);}
  function download(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  $("et-run").addEventListener("click",()=>{try{run();}catch(e){$("et-output").textContent=`ERROR: ${e.message}`;}});
  $("et-roundtrip").addEventListener("click",()=>{const rs=currentRotors(),p=EMIGNACore.utf8($("et-input").value),c=EMIGNACore.transform(p,rs,false),d=EMIGNACore.transform(c,rs,true);$("et-output").textContent=JSON.stringify({cipherHex:EMIGNACore.hex(c),roundTrip:EMIGNACore.text(d),match:EMIGNACore.text(d)===$("et-input").value},null,2);});
  $("er-build").addEventListener("click",()=>{state.rotors=EMIGNACore.buildConfig($("et-seed").value,+$("et-count").value||4);renderRotors();});$("er-export").addEventListener("click",()=>download(JSON.stringify(currentRotors(),null,2),`emigna-rotors-${Date.now()}.json`));
  $("es-run").addEventListener("click",()=>{$("es-output").textContent=JSON.stringify({sha3_256:EMIGNACore.sha3Hex($("es-input").value)},null,2);});$("es-vector").addEventListener("click",()=>{const got=EMIGNACore.sha3Hex(""),expected="a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a";$("es-output").textContent=JSON.stringify({input:"",got,expected,pass:got===expected},null,2);});
  $("ec-load").addEventListener("click",()=>{try{state.rotors=validate(JSON.parse($("ec-json").value));renderRotors();$("ec-output").textContent=`Loaded ${state.rotors.length} rotor(s).`;}catch(e){$("ec-output").textContent=`ERROR: ${e.message}`;}});
  $("eb-run").addEventListener("click",()=>{const kib=Math.max(1,Math.min(4096,+$("eb-kib").value||256)),it=Math.max(1,Math.min(100,+$("eb-it").value||5)),b=new Uint8Array(kib*1024),rs=currentRotors();crypto.getRandomValues(b.subarray(0,Math.min(b.length,65536)));for(let off=65536;off<b.length;off+=65536)b.set(b.subarray(0,Math.min(65536,b.length-off)),off);const t=performance.now();for(let i=0;i<it;i++)EMIGNACore.transform(b,rs,false);const ms=performance.now()-t,mb=(b.length*it)/(1024*1024);$("eb-output").textContent=JSON.stringify({payloadKiB:kib,iterations:it,totalMiB:mb,elapsedMs:ms,throughputMiBps:mb/(ms/1000),backend:"CPU JavaScript",nativeArchitectureNote:"CUDA/GPU acceleration is outside this web port."},null,2);});
  state.rotors=EMIGNACore.buildConfig($("et-seed").value,+$("et-count").value||4);renderRotors();
  window.EMIGNA=Object.freeze({version:"0.1.0-alpha-web",sha3:EMIGNACore.sha3Hex,buildRotors:EMIGNACore.buildConfig,transform:EMIGNACore.transform});
  window.ZZXHooks?.emit("emigna:ready",{version:"0.1.0-alpha-web"});
})();
