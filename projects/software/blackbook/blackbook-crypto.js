(() => {
"use strict";
const te=new TextEncoder(),td=new TextDecoder();
function b64(b){let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s);}
function ub64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function key(pass,salt,it){const raw=await crypto.subtle.importKey("raw",te.encode(pass),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:it},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}
async function encrypt(v,pass){if(!pass)throw new Error("Password required.");const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000,k=await key(pass,salt,iterations),ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},k,te.encode(JSON.stringify(v))));return{schema:"zzx.blackbook.vault.v1",kdf:"PBKDF2-HMAC-SHA256",iterations,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),ciphertext:b64(ct)};}
async function decrypt(e,pass){const k=await key(pass,ub64(e.salt),e.iterations),pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(e.iv)},k,ub64(e.ciphertext));return JSON.parse(td.decode(pt));}
window.BlackBookCrypto=Object.freeze({encrypt,decrypt});
})();
