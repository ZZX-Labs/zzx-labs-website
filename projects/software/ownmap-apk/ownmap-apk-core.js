(()=>{"use strict";
const O={};
O.enc=new TextEncoder();O.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
O.sha256=async f=>O.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())));
O.download=(text,name,type="application/json")=>{const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.OwnMapAPKCore=Object.freeze(O);
})();
