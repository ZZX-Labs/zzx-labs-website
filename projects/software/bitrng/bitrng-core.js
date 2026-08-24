(() => {
  "use strict";
  const te=new TextEncoder();

  function randomBytes(n){
    const out=new Uint8Array(Math.max(1,Math.floor(Number(n)||1)));
    for(let i=0;i<out.length;i+=65536)crypto.getRandomValues(out.subarray(i,Math.min(out.length,i+65536)));
    return out;
  }
  function hex(b){return[...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
  function fromHex(s){s=String(s).replace(/\s+/g,"");if(s.length%2||!/^[0-9a-f]*$/i.test(s))throw new Error("Invalid hex.");return Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));}
  function base64(b){let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}
  async function sha256(b){return new Uint8Array(await crypto.subtle.digest("SHA-256",b));}
  async function sha256HexText(t){return hex(await sha256(te.encode(String(t))));}

  async function hmacStream(seedHex,context,count){
    const key=await crypto.subtle.importKey("raw",fromHex(seedHex),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const out=new Uint8Array(Math.max(1,Number(count)||1));let off=0,counter=0;
    while(off<out.length){
      const msg=te.encode(`${context}:${counter++}`);
      const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,msg));
      const n=Math.min(sig.length,out.length-off);out.set(sig.subarray(0,n),off);off+=n;
    }
    return out;
  }

  function tests(bytes){
    const n=bytes.length,counts=new Array(256).fill(0);let ones=0,sum=0,sum2=0,serial=0;
    for(const b of bytes){counts[b]++;sum+=b;sum2+=b*b;for(let i=0;i<8;i++)ones+=(b>>i)&1;}
    for(let i=0;i<n-1;i++)serial+=bytes[i]*bytes[i+1];
    const bits=n*8,p1=bits?ones/bits:0;
    const shannon=counts.reduce((s,c)=>{if(!c)return s;const p=c/n;return s-p*Math.log2(p);},0);
    const mean=n?sum/n:0,den=n?sum2-n*mean*mean:0;
    const corr=n>1&&den?((serial-(n-1)*mean*mean)/den):0;
    const expected=n/256,chi2=expected?counts.reduce((s,c)=>s+(c-expected)**2/expected,0):0;
    return {bytes:n,bits,ones,zeros:bits-ones,oneFraction:p1,shannonBitsPerByte:shannon,byteChiSquare:chi2,serialCorrelation:corr,minByteCount:Math.min(...counts),maxByteCount:Math.max(...counts)};
  }

  window.BitRNGCore=Object.freeze({randomBytes,hex,fromHex,base64,sha256,sha256HexText,hmacStream,tests});
})();
