(()=>{"use strict";const S={};S.enc=new TextEncoder();S.dec=new TextDecoder();
S.hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");S.unhex=h=>new Uint8Array((h.match(/../g)||[]).map(x=>parseInt(x,16)));
S.derive=async(pass,salt)=>crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:220000,hash:"SHA-256"},await crypto.subtle.importKey("raw",S.enc.encode(pass),"PBKDF2",false,["deriveKey"]),{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
S.encrypt=async(text,pass)=>{const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await S.derive(pass,salt),ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,S.enc.encode(text)));return{salt:S.hex(salt),iv:S.hex(iv),ciphertext:S.hex(ct)}};
S.decrypt=async(pkg,pass)=>{const key=await S.derive(pass,S.unhex(pkg.salt)),pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:S.unhex(pkg.iv)},key,S.unhex(pkg.ciphertext));return S.dec.decode(pt)};
window.StegoMicrodotCore=Object.freeze(S)})();
