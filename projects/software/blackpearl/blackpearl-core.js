(()=>{"use strict";
const BP={};
BP.uid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");
BP.ext=name=>{const m=String(name||"").toLowerCase().match(/(\.[a-z0-9]{1,8})$/);return m?m[1]:""};
BP.randomName=name=>BP.uid().replaceAll("-","")+BP.ext(name);
BP.hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
BP.sha256=async file=>BP.hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())));
BP.download=(blob,name)=>{
 const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)
};
BP.textDownload=(text,name,type="application/json")=>BP.download(new Blob([text],{type}),name);

BP.scanJPEG=async file=>{
 const b=new Uint8Array(await file.arrayBuffer());
 if(b.length<4||b[0]!==0xff||b[1]!==0xd8)return{isJPEG:false,exif:false,segments:0};
 let i=2,exif=false,segments=0;
 while(i+4<=b.length){
   if(b[i]!==0xff)break;
   const marker=b[i+1];
   if(marker===0xda||marker===0xd9)break;
   const len=(b[i+2]<<8)|b[i+3];
   if(len<2||i+2+len>b.length)break;
   segments++;
   if(marker===0xe1){
     const sig=String.fromCharCode(...b.slice(i+4,Math.min(i+10,b.length)));
     if(sig.startsWith("Exif"))exif=true;
   }
   i+=2+len;
 }
 return{isJPEG:true,exif,segments};
};

BP.stripJPEG=async file=>{
 const b=new Uint8Array(await file.arrayBuffer());
 if(b[0]!==0xff||b[1]!==0xd8)throw new Error("Not a JPEG.");
 const out=[b.slice(0,2)];
 let i=2;
 while(i<b.length){
   if(b[i]!==0xff){out.push(b.slice(i));break}
   const marker=b[i+1];
   if(marker===0xda){out.push(b.slice(i));break}
   if(marker===0xd9){out.push(b.slice(i,i+2));break}
   if(i+4>b.length)throw new Error("Truncated JPEG segment.");
   const len=(b[i+2]<<8)|b[i+3];
   if(len<2||i+2+len>b.length)throw new Error("Invalid JPEG segment.");
   // Keep critical/non-metadata segments; drop APP1..APP15 and COM.
   if(!((marker>=0xe1&&marker<=0xef)||marker===0xfe))out.push(b.slice(i,i+2+len));
   i+=2+len;
 }
 return new Blob(out,{type:"image/jpeg"});
};

BP.stripPNG=async file=>{
 const b=new Uint8Array(await file.arrayBuffer());
 const sig=[137,80,78,71,13,10,26,10];
 if(b.length<8||!sig.every((v,i)=>b[i]===v))throw new Error("Not a PNG.");
 const chunks=[b.slice(0,8)];
 let i=8;
 const keep=new Set(["IHDR","PLTE","IDAT","IEND","tRNS","gAMA","cHRM","sRGB"]);
 while(i+12<=b.length){
   const len=((b[i]<<24)>>>0)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
   const type=String.fromCharCode(...b.slice(i+4,i+8));
   const end=i+12+len;
   if(end>b.length)throw new Error("Invalid PNG chunk.");
   if(keep.has(type))chunks.push(b.slice(i,end));
   i=end;
   if(type==="IEND")break;
 }
 return new Blob(chunks,{type:"image/png"});
};

BP.inspect=async file=>{
 const ext=BP.ext(file.name),sha256=await BP.sha256(file),randomName=BP.randomName(file.name);
 let metadataRisk="unknown",sanitizable=false,notes=[];
 if(file.type==="image/jpeg"||[".jpg",".jpeg"].includes(ext)){
   const s=await BP.scanJPEG(file);metadataRisk=s.exif?"EXIF present":"no EXIF APP1 detected";sanitizable=true;
   if(s.exif)notes.push("EXIF/APP1 metadata detected; strip before publishing.");
 }
 else if(file.type==="image/png"||ext===".png"){metadataRisk="ancillary chunks may contain metadata";sanitizable=true}
 else if(file.type.startsWith("video/")||file.type.startsWith("audio/")){metadataRisk="container metadata possible";notes.push("Use native FFmpeg sanitizer before publication.")}
 else if(file.type==="application/pdf"||ext===".pdf"){metadataRisk="document metadata possible";notes.push("Use native PDF sanitizer before publication.")}
 else {metadataRisk="unverified attachment metadata";notes.push("Treat as attachment; scan and sanitize server-side before publication.")}
 return{name:file.name,type:file.type||"unknown",bytes:file.size,sha256,randomName,metadataRisk,sanitizable,notes};
};

window.BlackPearlCore=Object.freeze(BP);
})();
