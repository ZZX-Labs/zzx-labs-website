(() => {
  "use strict";
  const te=new TextEncoder();
  async function sha256Hex(text){const d=await crypto.subtle.digest("SHA-256",te.encode(String(text)));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  function b64(b){let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s);} function ub64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  async function derive(p,salt,it){const k=await crypto.subtle.importKey("raw",te.encode(p),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:it},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}
  async function encrypt(value,password,it=310000){if(!password)throw new Error("Password required.");const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(password,salt,it),ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,te.encode(JSON.stringify(value))));return{schema:"zzx.bitescrow.evidence.v1",kdf:"PBKDF2-HMAC-SHA256",iterations:it,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),ciphertext:b64(ct)};}
  window.BitEscrowCore=Object.freeze({sha256Hex,encrypt});
})();
