(() => {
  "use strict";

  const ALPHABET="123456789BDEFGHJKLNQRTUVWXYZbdefghijknoqrtuvwxyz";
  const BASE=48n;
  const MAP=new Map([...ALPHABET].map((ch,i)=>[ch,BigInt(i)]));

  function encode(bytes) {
    if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
    if(!bytes.length)return "";

    let zeros=0;
    while(zeros<bytes.length&&bytes[zeros]===0)zeros++;

    let n=0n;
    for(const b of bytes)n=(n<<8n)+BigInt(b);

    let out="";
    while(n>0n) {
      const rem=Number(n%BASE);
      out=ALPHABET[rem]+out;
      n/=BASE;
    }

    return ALPHABET[0].repeat(zeros)+out;
  }

  function decode(text) {
    const s=String(text||"");
    if(!s.length)return new Uint8Array();

    let zeros=0;
    while(zeros<s.length&&s[zeros]===ALPHABET[0])zeros++;

    let n=0n;
    for(const ch of s) {
      if(!MAP.has(ch))throw new Error(`Invalid Base48 character: ${JSON.stringify(ch)}`);
      n=n*BASE+MAP.get(ch);
    }

    const bytes=[];
    while(n>0n) {
      bytes.push(Number(n&255n));
      n>>=8n;
    }
    bytes.reverse();

    const out=new Uint8Array(zeros+bytes.length);
    out.set(bytes,zeros);
    return out;
  }

  function encodeText(text) {
    return encode(new TextEncoder().encode(String(text)));
  }

  function decodeText(text,{fatal=true}={}) {
    return new TextDecoder("utf-8",{fatal}).decode(decode(text));
  }

  function hexToBytes(hex) {
    const clean=String(hex||"").replace(/\s+/g,"").replace(/^0x/i,"");
    if(clean.length%2)throw new Error("Hex input must contain an even number of digits.");
    if(!/^[0-9a-f]*$/i.test(clean))throw new Error("Hex input contains invalid characters.");
    const out=new Uint8Array(clean.length/2);
    for(let i=0;i<out.length;i++)out[i]=parseInt(clean.slice(i*2,i*2+2),16);
    return out;
  }

  function bytesToHex(bytes) {
    return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function inspect(text) {
    const s=String(text||"");
    const invalid=[...s].filter(ch=>!MAP.has(ch));
    let leadingZeroSymbols=0;
    while(leadingZeroSymbols<s.length&&s[leadingZeroSymbols]===ALPHABET[0])leadingZeroSymbols++;

    let decodedLength=null,error=null;
    if(!invalid.length) {
      try{decodedLength=decode(s).length;}catch(e){error=e.message;}
    }

    return {
      canonical:invalid.length===0,
      length:s.length,
      alphabetLength:ALPHABET.length,
      invalid:[...new Set(invalid)],
      leadingZeroSymbols,
      decodedLength,
      error
    };
  }

  window.Base48Codec=Object.freeze({
    ALPHABET,
    encode,
    decode,
    encodeText,
    decodeText,
    hexToBytes,
    bytesToHex,
    inspect
  });
})();
