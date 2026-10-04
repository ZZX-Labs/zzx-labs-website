(()=>{"use strict";
const P={};
P.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
P.sha256=async f=>P.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())));
P.tokens=s=>String(s||"").toLowerCase().split(/[^a-z0-9_]+/).filter(x=>x.length>1);
P.score=(rec,q)=>{const qs=P.tokens(q);if(!qs.length)return 1;const hay=P.tokens(`${rec.name} ${rec.path} ${rec.type} ${rec.preview||""} ${rec.schemaKeys?.join(" ")||""}`);let hit=0;for(const t of qs)if(hay.some(h=>h.includes(t)))hit++;return hit/qs.length};
P.download=(text,name,type="application/json")=>{const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.ParallelExplorerCore=Object.freeze(P);
})();
