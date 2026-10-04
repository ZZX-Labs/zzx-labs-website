(()=>{"use strict";
const N={};
N.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
N.sha256=async f=>N.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())));
N.tokens=name=>[...new Set(name.replace(/\.[^.]+$/,"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2))];
N.download=(text,name,type="application/json")=>{const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.NaturaVACore=Object.freeze(N);
})();
