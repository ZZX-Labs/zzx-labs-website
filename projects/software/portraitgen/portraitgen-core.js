(()=>{"use strict";
const P={};
P.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
P.sha256Text=async s=>P.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
P.sha256File=async f=>P.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())));
P.seed=()=>{const x=new Uint32Array(1);crypto.getRandomValues(x);return x[0]};
P.download=(text,name)=>{const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.PortraitGenCore=Object.freeze(P);
})();
