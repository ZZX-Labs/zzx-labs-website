(()=>{"use strict";
const $=id=>document.getElementById(id);let docs=[],observations=[];
function hex(b){return[...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
$("pdfs").onchange=async()=>{
 for(const f of [...$("pdfs").files]){
  const buf=await f.arrayBuffer(),bytes=new Uint8Array(buf),hash=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",buf))),raw=new TextDecoder("latin1").decode(bytes.slice(0,Math.min(bytes.length,4_000_000)));
  const counts={redactSubtype:(raw.match(/\/Subtype\s*\/Redact/g)||[]).length,annots:(raw.match(/\/Annots\b/g)||[]).length,rect:(raw.match(/\/Rect\b/g)||[]).length,images:(raw.match(/\/Subtype\s*\/Image/g)||[]).length,objects:(raw.match(/\bendobj\b/g)||[]).length};
  docs.push({id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),name:f.name,bytes:f.size,sha256:hash,structuralKeywordCounts:counts,note:"raw structural keyword scan; not a PDF text/OCR extraction"});
 }
 render();$("pdfs").value=""
};
function render(){const e=$("docs");e.replaceChildren();docs.forEach((d,i)=>{const x=document.createElement("div");x.className="sc-doc";x.innerHTML=`<strong>${i+1}. ${d.name}</strong><div class="fx-watermark">${d.bytes} bytes · ${d.sha256.slice(0,18)}…</div><pre class="z-log">${JSON.stringify(d.structuralKeywordCounts,null,2)}</pre>`;e.append(x)});$("count").textContent=docs.length;$("redact-hints").textContent=docs.reduce((s,d)=>s+d.structuralKeywordCounts.redactSubtype,0)}
$("add-observation").onclick=()=>{const x={id:Math.random().toString(36).slice(2),document:$("obs-doc").value.trim(),page:+$("obs-page").value||null,pattern:$("obs-pattern").value.trim(),context:$("obs-context").value.trim(),category:$("obs-category").value.trim(),source:"analyst-observed"};if(!x.document||!x.pattern)return;observations.push(x);$("obs-output").textContent=JSON.stringify(observations,null,2);correlate()};
function correlate(){const groups={};for(const o of observations){const k=o.pattern.toLowerCase();(groups[k]??=[]).push(o)}const corr=Object.entries(groups).map(([pattern,items])=>({pattern,count:items.length,documents:[...new Set(items.map(x=>x.document))],pages:items.map(x=>x.page).filter(Boolean),categories:[...new Set(items.map(x=>x.category).filter(Boolean))]})).sort((a,b)=>b.count-a.count);$("corr-output").textContent=JSON.stringify(corr,null,2)}
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.scuzzlebutt.corpus.v1",exported:new Date().toISOString(),documents:docs,observations,note:"structural PDF scan plus analyst observations; no hidden-text recovery claim"},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="scuzzlebutt-corpus.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();correlate();window.Scuzzlebutt=Object.freeze({version:"0.1.0-alpha-web",recoversRedactedText:false});
})();
