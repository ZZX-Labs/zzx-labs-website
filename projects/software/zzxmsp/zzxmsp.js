(()=>{"use strict";const $=id=>document.getElementById(id),enc=new TextEncoder();let words=[],last=null;
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
$("wordlist").onchange=async()=>{const f=$("wordlist").files[0];if(!f)return;words=(await f.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);$("wordlist").value="";renderWords()};
function renderWords(){$("word-count").textContent=words.length;$("word-preview").textContent=words.slice(0,300).map((w,i)=>`${i.toString().padStart(4,"0")} ${w}`).join("\n")}
function indexBits(n){return Math.floor(Math.log2(n))}
async function generate(){
 if(words.length<256){$("status").textContent="Import a wordlist containing at least 256 unique entries.";return}
 if(new Set(words).size!==words.length){$("status").textContent="Wordlist must contain unique entries.";return}
 const count=Math.max(8,Math.min(32,+$("count").value||16)),bytes=crypto.getRandomValues(new Uint8Array(count*2)),digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const out=[];for(let i=0;i<count;i++){const idx=((bytes[i*2]<<8)|bytes[i*2+1])%words.length;out.push({index:idx,word:words[idx]})}
 const checksum=hex(digest.slice(0,4));
 last={schema:"zzx.msp.experimental.v1",created:new Date().toISOString(),wordlistSize:words.length,wordCount:count,entropyHex:hex(bytes),checksum32:checksum,indices:out.map(x=>x.index),phrase:out.map(x=>x.word),productionWalletCompatible:false,bip39Compatible:false};
 $("phrase").textContent=out.map(x=>x.word).join(" ");$("indices").textContent=out.map(x=>x.index).join(" ");$("checksum").textContent=checksum;$("status").textContent="Generated new local experimental mnemonic from Web Crypto entropy."
}
$("generate").onclick=generate;
$("encode").onclick=()=>{if(!words.length)return;const toks=$("encode-text").value.trim().split(/\s+/).filter(Boolean),idx=toks.map(w=>words.indexOf(w));$("encode-out").textContent=idx.some(i=>i<0)?"Unknown word(s) for current list.":idx.join(" ")};
$("decode").onclick=()=>{if(!words.length)return;const ids=$("decode-indices").value.trim().split(/\s+/).map(Number);$("decode-out").textContent=ids.some(i=>!Number.isInteger(i)||i<0||i>=words.length)?"Invalid index for current list.":ids.map(i=>words[i]).join(" ")};
$("export").onclick=()=>{if(!last)return;const t=JSON.stringify(last,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zzxmsp-experimental.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("sample").onclick=()=>{words=Array.from({length:2048},(_,i)=>`zzxword${i.toString().padStart(4,"0")}`);renderWords();$("status").textContent="Loaded synthetic demonstration lexicon. It is not a production wallet wordlist."};
renderWords();window.ZZXMSP=Object.freeze({version:"0.2.0-alpha-web",bip39Compatible:false,existingSeedInput:false});
})();
