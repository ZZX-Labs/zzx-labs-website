(()=>{"use strict";
const $=id=>document.getElementById(id),state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
if($("run"))$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
if($("swap"))$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
if($("clear"))$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function standaloneHTML(){
 const title=$("page-title").value.trim()||"CyberChefHTML Offline",intro=$("intro").value,op=$("default-op").value,theme=$("standalone-theme").value;
 const dark=theme==="dark",bg=dark?"#121212":"#f5f5f5",fg=dark?"#e8e8e8":"#202020",surface=dark?"#181818":"#ffffff",accent=dark?"#c0d674":"#365c36";
 const csp=$("csp-mode").value==="inline"?"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'";
 const script=`const te=new TextEncoder(),td=new TextDecoder();
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
const b64=b=>btoa(String.fromCharCode(...b));
const rot13=s=>s.replace(/[A-Za-z]/g,c=>String.fromCharCode((c<="Z"?65:97)+(c.charCodeAt(0)-(c<="Z"?65:97)+13)%26));
async function sha256(s){const d=await crypto.subtle.digest("SHA-256",te.encode(s));return hex(new Uint8Array(d))}
async function run(){
 const s=document.getElementById("i").value,op=document.getElementById("op").value;let out="";
 if(op==="base64")out=b64(te.encode(s));
 else if(op==="hex")out=hex(te.encode(s));
 else if(op==="rot13")out=rot13(s);
 else out=await sha256(s);
 document.getElementById("o").value=out;
}
document.getElementById("run").addEventListener("click",run);run();`;
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="${$("referrer").value}">
<title>${title.replaceAll("<","&lt;")}</title>
<style>body{margin:0;background:${bg};color:${fg};font:14px ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:960px;margin:auto;padding:28px}textarea,select,button{font:inherit}textarea{width:100%;min-height:180px;background:${surface};color:${fg};border:1px solid ${accent};padding:12px;box-sizing:border-box}button{background:${accent};border:0;padding:10px 14px;margin:12px 0;cursor:pointer}select{padding:8px;background:${surface};color:${fg}}</style>
</head><body><main><h1>${title.replaceAll("<","&lt;")}</h1><p>${intro.replaceAll("<","&lt;")}</p>
<label>Operation <select id="op"><option value="sha256"${op==="sha256"?" selected":""}>SHA-256</option><option value="base64"${op==="base64"?" selected":""}>Base64</option><option value="hex"${op==="hex"?" selected":""}>Hex</option><option value="rot13"${op==="rot13"?" selected":""}>ROT13</option></select></label>
<h2>Input</h2><textarea id="i">abc</textarea><button id="run">RUN</button><h2>Output</h2><textarea id="o" readonly></textarea>
<script>${script}<\/script></main></body></html>`;
}
$("build-html").onclick=()=>{const t=standaloneHTML();state.artifacts["cyberchef-offline.html"]=t;$("standalone").value=t;$("builder-output").textContent=JSON.stringify({bytes:new TextEncoder().encode(t).length,externalAssets:0,defaultOperation:$("default-op").value},null,2)};
$("build-policy").onclick=()=>{const p={offline:$("no-network").checked,cspMode:$("csp-mode").value,referrerPolicy:$("referrer").value,networkAPIsAllowed:false,externalAssets:0};$("security-output").textContent=JSON.stringify(p,null,2)};
$("verify-html").onclick=async()=>{const t=$("standalone").value||standaloneHTML(),checks={doctype:/^<!doctype html>/i.test(t),hasCSP:/Content-Security-Policy/i.test(t),noExternalScript:!/<script[^>]+src=/i.test(t),noExternalStylesheet:!/<link[^>]+stylesheet/i.test(t),noFetch:!/\bfetch\s*\(/.test(t),noXHR:!/\bXMLHttpRequest\b/.test(t),noWebSocket:!/\bWebSocket\b/.test(t)},hash=await ChefCore.op("sha256",t);$("verify-output").textContent=JSON.stringify({checks,allPass:Object.values(checks).every(Boolean),sha256:hash,bytes:new TextEncoder().encode(t).length},null,2)};
$("download-html").onclick=()=>{const t=$("standalone").value||standaloneHTML();dl(t,"cyberchefhtml-offline.html","text/html");$("export-output").textContent=`Downloaded ${new TextEncoder().encode(t).length} byte standalone HTML.`};
$("build-html").click();window.CyberChefHTML=Object.freeze({version:"0.1.0-alpha-web",buildStandalone:standaloneHTML,runRecipe:ChefCore.recipe});window.ZZXHooks?.emit("cyberchefhtml:ready",{version:"0.1.0-alpha-web"});
})();
