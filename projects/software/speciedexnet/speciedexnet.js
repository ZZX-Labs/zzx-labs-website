(()=>{"use strict";
const $=id=>document.getElementById(id),S=SpeciedexShared;
let peers=[],contribs=[],keypair=null,messages=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("add-peer").onclick=()=>{const p={id:$("peer-id").value.trim(),endpoint:$("peer-endpoint").value.trim(),role:$("peer-role").value,trust:$("peer-trust").value};if(!p.id)return;peers.push(p);renderPeers()};
function renderPeers(){const e=$("peers");e.replaceChildren();peers.forEach(p=>{const s=document.createElement("span");s.className="net-peer";s.textContent=`${p.id} · ${p.role} · ${p.trust}`;e.append(s)});$("peer-count").textContent=peers.length}
$("generate-key").onclick=async()=>{keypair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);const pub=await crypto.subtle.exportKey("jwk",keypair.publicKey);$("key-output").textContent=JSON.stringify({algorithm:"ECDSA-P256",publicKey:pub,privateKey:"generated in-memory; never exported by this page"},null,2)};
$("contribute").onclick=async()=>{
 if(!keypair){$("contrib-output").textContent="Generate an in-memory signing key first.";return}
 const payload={id:S.uid(),version:1,scientificName:$("species").value.trim(),field:$("field").value,value:$("value").value.trim(),source:$("source").value.trim(),created:new Date().toISOString(),incentive:{asset:"BTC",rail:"lightning",sats:+$("sats").value||0,status:"metadata-only",paymentExecuted:false}};
 if(S.rejectHuman({scientificName:payload.scientificName})){$("contrib-output").textContent="Homo sapiens is excluded from this Speciedex taxonomy network.";return}
 const bytes=new TextEncoder().encode(JSON.stringify(payload)),sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},keypair.privateKey,bytes));payload.signature=[...sig].map(x=>x.toString(16).padStart(2,"0")).join("");payload.signatureAlgorithm="ECDSA-P256-SHA256";contribs.push(payload);$("contrib-output").textContent=JSON.stringify(payload,null,2);renderContribs()
};
function renderContribs(){const e=$("contribs");e.replaceChildren();contribs.forEach(c=>{const d=document.createElement("div");d.className="net-event";d.innerHTML=`<strong>${esc(c.scientificName)} · ${esc(c.field)}</strong><div>${esc(c.value)}</div><div class="fx-watermark">v${c.version} · ${c.signature.slice(0,18)}… · ${c.incentive.sats} sats incentive metadata</div>`;e.append(d)});$("contrib-count").textContent=contribs.length}
$("encrypt").onclick=async()=>{
 const pass=$("message-pass").value;if(pass.length<8){$("message-output").textContent="Use a passphrase of at least 8 characters.";return}
 const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]),key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:200000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt"]),ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode($("message").value)));
 const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");const pkg={schema:"zzx.speciedexnet.field-message.v1",cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256-200000",salt:hex(salt),iv:hex(iv),ciphertext:hex(ct),networkSent:false};messages.push(pkg);$("message-output").textContent=JSON.stringify(pkg,null,2)
};
$("export").onclick=()=>S.download(JSON.stringify({schema:"zzx.speciedexnet.snapshot.v1",exported:new Date().toISOString(),peers,contributions:contribs,messages,networkConnectionsOpened:false,livePayments:false},null,2),"speciedexnet-snapshot.json");
renderPeers();renderContribs();window.SpeciedexNet=Object.freeze({version:"0.3.0-alpha-web",opensP2PConnections:false,livePayments:false});
})();
