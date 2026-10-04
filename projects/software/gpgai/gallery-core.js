(()=>{"use strict";window.GalleryCore=Object.freeze({
 id:()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),
 esc:s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
 async hash(file){const d=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")},
 dl(t,n,type="application/json"){const b=new Blob([t],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
})})();
