(()=>{"use strict";const $=id=>document.getElementById(id);let sources=[],claims=[],notes=[];
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
$("add-source").onclick=()=>{const s={id:uid(),title:$("source-title").value.trim(),url:$("source-url").value.trim(),type:$("source-type").value,reliability:+$("reliability").value,access:"public/authorized",added:new Date().toISOString()};if(!s.title)return;sources.push(s);render()};
$("add-claim").onclick=()=>{const c={id:uid(),text:$("claim").value.trim(),confidence:+$("confidence").value,status:$("claim-status").value,sourceIds:[...$("claim-sources").selectedOptions].map(o=>o.value),created:new Date().toISOString()};if(!c.text)return;claims.push(c);render()};
$("add-note").onclick=()=>{const t=$("note").value.trim();if(t)notes.push({id:uid(),text:t,created:new Date().toISOString()});render()};
function render(){
 const se=$("sources");se.replaceChildren();sources.forEach(s=>{const d=document.createElement("div");d.className="z-card";d.innerHTML=`<strong>${s.title}</strong> · ${s.type} · reliability ${s.reliability}/5<div>${s.url||"local source"}</div>`;se.append(d)});
 const sel=$("claim-sources");sel.replaceChildren();sources.forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.title;sel.append(o)});
 const ce=$("claims");ce.replaceChildren();claims.forEach(c=>{const linked=c.sourceIds.map(id=>sources.find(s=>s.id===id)?.title).filter(Boolean);const d=document.createElement("div");d.className="z-card";d.innerHTML=`<strong>${c.status.toUpperCase()}</strong> · confidence ${c.confidence}%<div>${c.text}</div><div class="fx-watermark">evidence: ${linked.join(", ")||"none linked"}</div>`;ce.append(d)});
 $("source-count").textContent=sources.length;$("claim-count").textContent=claims.length;$("confirmed").textContent=claims.filter(c=>c.status==="supported").length;$("avg").textContent=(claims.length?claims.reduce((s,c)=>s+c.confidence,0)/claims.length:0).toFixed(1)+"%";
 tokenize()
}
function tokenize(){
 const stop=new Set("the a an and or of to in for on with from by is are was were be been this that it as at".split(" "));
 const f=new Map(),text=[...sources.map(s=>s.title),...claims.map(c=>c.text),...notes.map(n=>n.text)].join(" ").toLowerCase();
 for(const w of text.match(/[a-z0-9][a-z0-9_-]{2,}/g)||[]){if(stop.has(w))continue;f.set(w,(f.get(w)||0)+1)}
 $("terms").textContent=[...f.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,60).map(([w,n])=>`${w}\t${n}`).join("\n")
}
$("hypothesis").onclick=()=>{
 const q=$("question").value.trim();if(!q)return;
 const terms=(q.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g)||[]);
 const ranked=claims.map(c=>{const hay=c.text.toLowerCase(),match=terms.filter(t=>hay.includes(t)).length;return{claim:c.text,status:c.status,confidence:c.confidence,keywordMatches:match,evidence:c.sourceIds.length}}).sort((a,b)=>b.keywordMatches-a.keywordMatches||b.confidence-a.confidence);
 $("analysis").textContent=JSON.stringify({question:q,method:"deterministic local evidence ranking; not LLM inference",topClaims:ranked.slice(0,10),publicAuthorizedSourcesOnly:true,activeRecon:false},null,2)
};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.zira.workspace.v1",exported:new Date().toISOString(),sources,claims,notes,scope:{publicOrAuthorizedOnly:true,activeScanning:false,credentialCollection:false,automatedAttribution:false}},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zira-workspace.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();window.ZIRA=Object.freeze({version:"0.4.0-alpha-web",liveLLM:false,activeRecon:false});
})();
