(()=>{"use strict";
const $=id=>document.getElementById(id),P=PCECore;
let pkg=null,symbols=[];
function draw(){
 const c=$("wave"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.strokeStyle="#343434";x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke();if(!symbols.length)return;
 x.strokeStyle="#c0d674";x.beginPath();const n=Math.min(symbols.length,600);for(let i=0;i<n;i++){const s=symbols[i],px=i/(Math.max(1,n-1))*w,py=h/2-Math.sin(s.phase*Math.PI/180)*s.amplitude*h*.38;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()
}
$("encode").onclick=async()=>{
 const pass=$("pass").value,text=$("plain").value;if(pass.length<8){$("output").textContent="Passphrase must be at least 8 characters.";return}
 const enc=await P.encrypt(text,pass);symbols=P.phaseEncode(enc.ciphertext);pkg={schema:"zzx.pce.experimental.v1",cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256-250000",phaseEncoding:"byte-to-phase visualization/invertible transport mapping",securityClaim:"cryptographic security comes from AES-GCM, not from the phase wrapper",...enc,symbols};
 $("output").textContent=JSON.stringify(pkg,null,2);$("symbols").textContent=symbols.map(s=>`${s.phase.toFixed(2)}°`).join(" ");$("bytes").textContent=symbols.length;draw()
};
$("decode").onclick=async()=>{
 try{const obj=JSON.parse($("input-package").value),hex=P.phaseDecode(obj.symbols),plain=await P.decrypt({...obj,ciphertext:hex},$("pass").value);$("decode-output").textContent=plain}catch(e){$("decode-output").textContent="DECODE ERROR: "+e.message}
};
$("load-current").onclick=()=>{if(pkg)$("input-package").value=JSON.stringify(pkg)};
$("export").onclick=()=>{if(pkg)P.download(JSON.stringify(pkg,null,2),"pce-package.json")};
window.PCE=Object.freeze({version:"0.1.0-alpha-web",quantumResistanceClaim:false});
})();
