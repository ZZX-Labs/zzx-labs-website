(()=>{"use strict";
const S={};
S.uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
S.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
S.sha256=async text=>S.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));
S.rankOrder=["kingdom","phylum","class","order","family","genus","species"];
S.rejectHuman=r=>String(r.scientificName||"").trim().toLowerCase()==="homo sapiens";
S.normalize=r=>({
 id:r.id||S.uid(),
 scientificName:String(r.scientificName||r.species||"").trim(),
 commonName:String(r.commonName||"").trim(),
 kingdom:String(r.kingdom||"").trim(),
 phylum:String(r.phylum||"").trim(),
 class:String(r.class||"").trim(),
 order:String(r.order||"").trim(),
 family:String(r.family||"").trim(),
 genus:String(r.genus||"").trim(),
 species:String(r.species||r.scientificName||"").trim(),
 status:String(r.status||"unknown").trim(),
 habitat:String(r.habitat||"").trim(),
 region:String(r.region||"").trim(),
 source:String(r.source||"user-supplied").trim(),
 confidence:Number.isFinite(+r.confidence)?Math.max(0,Math.min(1,+r.confidence)):null,
 verifiedBy:Array.isArray(r.verifiedBy)?r.verifiedBy:[],
 updated:r.updated||new Date().toISOString()
});
S.download=(text,name,type="application/json")=>{const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.SpeciedexShared=Object.freeze(S);
})();
