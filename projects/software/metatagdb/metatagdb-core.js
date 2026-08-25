(()=>{"use strict";
const MT={};
MT.hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
MT.sha256=async file=>MT.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())));
MT.ext=name=>{const m=String(name||"").toLowerCase().match(/(\.[a-z0-9]{1,12})$/);return m?m[1]:""};
MT.parseName=name=>{
 const base=String(name||"").replace(/\.[^.]+$/,"");
 const bits=base.split(/[-_.\s]+/).filter(Boolean);
 return {basename:base,tokens:bits,suggestedTags:[...new Set(bits.map(x=>x.toLowerCase()).filter(x=>x.length>2))].slice(0,12)};
};
MT.dhashFromCanvas=c=>{
 const t=document.createElement("canvas");t.width=9;t.height=8;const x=t.getContext("2d",{willReadFrequently:true});x.drawImage(c,0,0,9,8);const d=x.getImageData(0,0,9,8).data,bits=[];
 for(let y=0;y<8;y++)for(let xx=0;xx<8;xx++){const i=(y*9+xx)*4,j=(y*9+xx+1)*4;const a=d[i]*.299+d[i+1]*.587+d[i+2]*.114,b=d[j]*.299+d[j+1]*.587+d[j+2]*.114;bits.push(a>b?1:0)}
 let h="";for(let i=0;i<64;i+=4)h+=parseInt(bits.slice(i,i+4).join(""),2).toString(16);return h
};
MT.download=(text,name,type="application/json")=>{const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.MetaTagDBCore=Object.freeze(MT);
})();
