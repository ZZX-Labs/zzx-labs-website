(()=>{"use strict";const $=id=>document.getElementById(id),S=StegoMicrodotCore;let pkg=null,bits=[];
function toBits(hex){return [...S.unhex(hex)].flatMap(b=>Array.from({length:8},(_,i)=>(b>>(7-i))&1))}
function draw(bits){
 const c=$("canvas"),x=c.getContext("2d"),cell=Math.max(2,+$("cell").value||6),cols=Math.max(16,+$("cols").value||64),rows=Math.max(1,Math.ceil(bits.length/cols));c.width=cols*cell;c.height=rows*cell;x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
 for(let i=0;i<bits.length;i++){const cx=i%cols,cy=Math.floor(i/cols),r=bits[i]?cell*.42:cell*.16;x.fillStyle="#000";x.beginPath();x.arc(cx*cell+cell/2,cy*cell+cell/2,r,0,Math.PI*2);x.fill()}
}
$("encode").onclick=async()=>{const p=$("pass").value;if(p.length<8){$("output").textContent="Use a passphrase of at least 8 characters.";return}const enc=await S.encrypt($("message").value,p);bits=toBits(enc.ciphertext);pkg={schema:"zzx.stegomicrodot.package.v1",cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256-220000",encoding:"binary-radius-microdot-v1",columns:+$("cols").value||64,cell:+$("cell").value||6,...enc,bitLength:bits.length};draw(bits);$("output").textContent=JSON.stringify(pkg,null,2);$("bits").textContent=bits.length};
$("decode").onclick=async()=>{try{const j=JSON.parse($("decode-pkg").value),txt=await S.decrypt(j,$("pass").value);$("decoded").textContent=txt}catch(e){$("decoded").textContent="DECODE ERROR: "+e.message}};
$("load").onclick=()=>{if(pkg)$("decode-pkg").value=JSON.stringify(pkg)};
$("png").onclick=()=>{const a=document.createElement("a");a.href=$("canvas").toDataURL("image/png");a.download="stegomicrodot.png";a.click()};
$("json").onclick=()=>{if(!pkg)return;const t=JSON.stringify(pkg,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="stegomicrodot-package.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("calibrate").onclick=()=>{const e=$("cal");e.replaceChildren();for(let i=0;i<8;i++){const s=document.createElement("span");const d=255-Math.round(i/7*255);s.style.background=`rgb(${d},${d},${d})`;s.title=`density ${i}/7`;e.append(s)}};
$("calibrate").click();window.StegoMicrodot=Object.freeze({version:"0.2.0-alpha-web",networkExfiltration:false});
})();
