(() => {
  "use strict";
  const te=new TextEncoder(),td=new TextDecoder();
  const b64=b=>{let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
  const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function key(password,salt,it=310000){
    const raw=await crypto.subtle.importKey("raw",te.encode(password),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:it},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function encrypt(bytes,password,meta={}){
    if(!password)throw new Error("Encryption password required.");
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000,k=await key(password,salt,iterations);
    const aad=te.encode(JSON.stringify(meta));
    const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad},k,bytes));
    return{schema:"zzx.bees.envelope.v1",kdf:"PBKDF2-HMAC-SHA256",iterations,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),aad:b64(aad),ciphertext:b64(ct),meta};
  }
  async function decrypt(env,password){
    const k=await key(password,ub64(env.salt),env.iterations),aad=ub64(env.aad);
    return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(env.iv),additionalData:aad},k,ub64(env.ciphertext)));
  }
  window.BEESCrypto=Object.freeze({encrypt,decrypt});
})();
