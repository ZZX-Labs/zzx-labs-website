(() => {
  "use strict";
  const te=new TextEncoder();

  async function sha256Hex(text) {
    const d=await crypto.subtle.digest("SHA-256",te.encode(String(text)));
    return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function commitment(label,numbers,nonce) {
    const normalized=[...numbers].map(Number).sort((a,b)=>a-b);
    const payload=JSON.stringify({label:String(label),numbers:normalized,nonce:String(nonce)});
    return {payload,commitment:await sha256Hex(payload)};
  }

  async function hmac(keyText,msgText) {
    const key=await crypto.subtle.importKey("raw",te.encode(keyText),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC",key,te.encode(msgText)));
  }

  async function draw({blockHash,commitments,count,min,max}) {
    const sorted=[...commitments].sort();
    const seedMaterial=JSON.stringify({blockHash:blockHash.toLowerCase(),commitments:sorted,count,min,max});
    const seed=await sha256Hex(seedMaterial);
    const pool=Array.from({length:max-min+1},(_,i)=>min+i),picked=[];
    let counter=0;
    while(picked.length<count&&pool.length) {
      const bytes=await hmac(seed,`draw:${counter++}`);
      for(let i=0;i+3<bytes.length&&picked.length<count&&pool.length;i+=4) {
        const n=((bytes[i]<<24)>>>0)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3];
        const idx=n%pool.length;
        picked.push(pool.splice(idx,1)[0]);
      }
    }
    return {seed,seedMaterial,result:picked.sort((a,b)=>a-b)};
  }

  window.BitLottoCore=Object.freeze({sha256Hex,commitment,draw});
})();
