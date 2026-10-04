(() => {
  "use strict";
  const MASK=(1n<<64n)-1n;
  const RC=[
    0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
    0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
    0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
    0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
    0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
    0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n
  ];
  const ROT=[
    [0,36,3,41,18],
    [1,44,10,45,2],
    [62,6,43,15,61],
    [28,55,25,21,56],
    [27,20,39,8,14]
  ];
  const te=new TextEncoder(),td=new TextDecoder();

  function rol(x,n){n=BigInt(n);return n===0n?x&MASK:((x<<n)|(x>>(64n-n)))&MASK;}
  function keccakF(s){
    for(let round=0;round<24;round++){
      const c=new Array(5),d=new Array(5);
      for(let x=0;x<5;x++)c[x]=s[x]^s[x+5]^s[x+10]^s[x+15]^s[x+20];
      for(let x=0;x<5;x++)d[x]=c[(x+4)%5]^rol(c[(x+1)%5],1);
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)s[x+5*y]=(s[x+5*y]^d[x])&MASK;
      const b=new Array(25).fill(0n);
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)b[y+5*((2*x+3*y)%5)]=rol(s[x+5*y],ROT[x][y]);
      for(let x=0;x<5;x++)for(let y=0;y<5;y++)s[x+5*y]=(b[x+5*y]^((~b[(x+1)%5+5*y])&b[(x+2)%5+5*y]))&MASK;
      s[0]=(s[0]^RC[round])&MASK;
    }
  }
  function sha3Bytes(input){
    const bytes=input instanceof Uint8Array?input:te.encode(String(input)),rate=136,padLen=rate-(bytes.length%rate),p=new Uint8Array(bytes.length+padLen);
    p.set(bytes);p[bytes.length]=0x06;p[p.length-1]|=0x80;
    const s=new Array(25).fill(0n);
    for(let off=0;off<p.length;off+=rate){
      for(let i=0;i<rate;i++)s[Math.floor(i/8)]^=BigInt(p[off+i])<<BigInt((i%8)*8);
      keccakF(s);
    }
    const out=new Uint8Array(32);
    for(let i=0;i<32;i++)out[i]=Number((s[Math.floor(i/8)]>>BigInt((i%8)*8))&255n);
    return out;
  }
  const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  const unhex=s=>Uint8Array.from(String(s).replace(/\s+/g,"").match(/../g)||[],x=>parseInt(x,16));
  function sha3Hex(v){return hex(sha3Bytes(v));}

  function seededPermutation(seed,label){
    const pool=Array.from({length:256},(_,i)=>i),out=[],material=sha3Bytes(`${seed}|${label}`);
    let counter=0,pos=0;
    while(pool.length){
      if(pos>=material.length){const next=sha3Bytes(`${seed}|${label}|${++counter}`);material.set(next.subarray(0,Math.min(material.length,next.length)));pos=0;}
      const idx=material[pos++]%pool.length;
      out.push(pool.splice(idx,1)[0]);
    }
    return out;
  }
  function inversePermutation(p){const inv=new Array(256);for(let i=0;i<256;i++)inv[p[i]]=i;return inv;}
  function buildConfig(seed,count=3){
    count=Math.max(1,Math.min(12,Math.floor(count)));
    return Array.from({length:count},(_,i)=>({
      id:`R${i+1}`,
      wiring:seededPermutation(seed,`rotor-${i}`),
      notch:(sha3Bytes(`${seed}|notch-${i}`)[0]),
      offset:(sha3Bytes(`${seed}|offset-${i}`)[0])
    }));
  }
  function applyRotorByte(v,rotor,pos,forward=true){
    const shift=(rotor.offset+pos)&255;
    if(forward)return (rotor.wiring[(v+shift)&255]-shift+256)&255;
    const inv=inversePermutation(rotor.wiring);
    return (inv[(v+shift)&255]-shift+256)&255;
  }
  function transform(bytes,rotors,decrypt=false){
    const out=new Uint8Array(bytes.length),positions=rotors.map(()=>0);
    for(let i=0;i<bytes.length;i++){
      let v=bytes[i];
      if(!decrypt){for(let r=0;r<rotors.length;r++)v=applyRotorByte(v,rotors[r],positions[r],true);}
      else{for(let r=rotors.length-1;r>=0;r--)v=applyRotorByte(v,rotors[r],positions[r],false);}
      out[i]=v;
      positions[0]=(positions[0]+1)&255;
      for(let r=0;r<rotors.length-1;r++){if(positions[r]===rotors[r].notch)positions[r+1]=(positions[r+1]+1)&255;else break;}
    }
    return out;
  }
  function utf8(s){return te.encode(String(s));}
  function text(b){return td.decode(b);}
  window.EMIGNACore=Object.freeze({sha3Bytes,sha3Hex,hex,unhex,buildConfig,transform,utf8,text});
})();
