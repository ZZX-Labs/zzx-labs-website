(() => {
  "use strict";

  function randomBytes(n) {
    const size=Math.max(1,Math.min(1048576,Math.floor(Number(n)||1)));
    const out=new Uint8Array(size);
    for(let i=0;i<size;i+=65536)crypto.getRandomValues(out.subarray(i,Math.min(size,i+65536)));
    return out;
  }

  function hex(bytes) { return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""); }
  function fromHex(text) {
    const s=String(text||"").replace(/\s+/g,"");
    if(s.length%2||!/^[0-9a-f]*$/i.test(s))throw new Error("Invalid hex input.");
    return Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
  }

  function base64(bytes) {
    let s="";
    for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(s);
  }

  async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  }

  async function hmacStream(seed,context,count) {
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(seed)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const ctx=new TextEncoder().encode(String(context));
    const out=new Uint8Array(Math.max(1,Math.floor(Number(count)||1)));
    let offset=0,counter=0;
    while(offset<out.length) {
      const block=new Uint8Array(4+ctx.length);
      new DataView(block.buffer).setUint32(0,counter,false);
      block.set(ctx,4);
      const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,block));
      out.set(sig.subarray(0,Math.min(sig.length,out.length-offset)),offset);
      offset+=Math.min(sig.length,out.length-offset);
      counter++;
    }
    return out;
  }

  window.BeefRNGCore=Object.freeze({randomBytes,hex,fromHex,base64,sha256,hmacStream});
})();
