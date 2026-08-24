(() => {
"use strict";

const td = new TextDecoder("utf-8", {fatal:false});

function hex(bytes) {
  return [...bytes].map(x => x.toString(16).padStart(2,"0")).join("");
}
function reverse(bytes) {
  return Uint8Array.from(bytes).reverse();
}
function concat(...parts) {
  const n = parts.reduce((s,p)=>s+p.length,0), out = new Uint8Array(n);
  let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out;
}
function u32le(bytes, o) {
  return (bytes[o] | bytes[o+1]<<8 | bytes[o+2]<<16 | bytes[o+3]<<24) >>> 0;
}
function i32le(bytes,o) {
  const n=u32le(bytes,o); return n>0x7fffffff?n-0x100000000:n;
}
function u64le(bytes,o) {
  let n=0n;
  for(let i=7;i>=0;i--) n=(n<<8n)|BigInt(bytes[o+i]);
  return n;
}
function encodeU32(n) {
  const b=new Uint8Array(4),v=new DataView(b.buffer);v.setUint32(0,n,true);return b;
}
function varint(bytes, pos) {
  if(pos>=bytes.length) throw new Error("Unexpected EOF reading CompactSize.");
  const x=bytes[pos++];
  if(x<0xfd) return {value:BigInt(x),pos,raw:bytes.slice(pos-1,pos)};
  if(x===0xfd){
    if(pos+2>bytes.length) throw new Error("EOF CompactSize u16.");
    const v=BigInt(bytes[pos]|bytes[pos+1]<<8),start=pos-1;pos+=2;return{value:v,pos,raw:bytes.slice(start,pos)};
  }
  if(x===0xfe){
    if(pos+4>bytes.length) throw new Error("EOF CompactSize u32.");
    const v=BigInt(u32le(bytes,pos)),start=pos-1;pos+=4;return{value:v,pos,raw:bytes.slice(start,pos)};
  }
  if(pos+8>bytes.length) throw new Error("EOF CompactSize u64.");
  const v=u64le(bytes,pos),start=pos-1;pos+=8;return{value:v,pos,raw:bytes.slice(start,pos)};
}
async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
}
async function dsha256(bytes) {
  return sha256(await sha256(bytes));
}
async function hashDisplay(bytes) {
  return hex(reverse(await dsha256(bytes)));
}
function safeCount(v,label,max=1000000) {
  if(v>BigInt(max)) throw new Error(`${label} count ${v} exceeds parser limit ${max}.`);
  return Number(v);
}
function scriptClass(script) {
  const h=hex(script);
  if(script.length>=1 && script[0]===0x6a) return "OP_RETURN";
  if(/^76a914[0-9a-f]{40}88ac$/.test(h)) return "P2PKH";
  if(/^a914[0-9a-f]{40}87$/.test(h)) return "P2SH";
  if(/^0014[0-9a-f]{40}$/.test(h)) return "P2WPKH";
  if(/^0020[0-9a-f]{64}$/.test(h)) return "P2WSH";
  if(/^5120[0-9a-f]{64}$/.test(h)) return "P2TR";
  return "script";
}
function opReturn(script) {
  if(!script.length || script[0]!==0x6a) return null;
  let p=1,data=[];
  while(p<script.length){
    const op=script[p++];
    let n;
    if(op<=75) n=op;
    else if(op===0x4c){ if(p>=script.length)break;n=script[p++]; }
    else if(op===0x4d){ if(p+2>script.length)break;n=script[p]|script[p+1]<<8;p+=2; }
    else break;
    if(p+n>script.length) break;
    data.push(...script.slice(p,p+n));p+=n;
  }
  const b=Uint8Array.from(data);
  let text=td.decode(b).replace(/\u0000/g,"");
  const printable=[...text].filter(c=>c>=" "&&c<="~").length;
  if(text.length && printable/text.length<0.6) text="";
  return {hex:hex(b),text};
}

async function parseTransaction(bytes,start) {
  let p=start;
  if(p+4>bytes.length) throw new Error("EOF transaction version.");
  const version=i32le(bytes,p);p+=4;
  let segwit=false,markerFlag=null;
  if(p+2<=bytes.length && bytes[p]===0x00 && bytes[p+1]!==0x00){
    segwit=true; markerFlag=bytes.slice(p,p+2);p+=2;
  }

  const vinCountVar=varint(bytes,p);p=vinCountVar.pos;
  const vinCount=safeCount(vinCountVar.value,"vin",100000);
  const inputs=[],vinSerialized=[];

  for(let i=0;i<vinCount;i++){
    const vinStart=p;
    if(p+36>bytes.length)throw new Error("EOF input outpoint.");
    const prevTxid=hex(reverse(bytes.slice(p,p+32)));p+=32;
    const vout=u32le(bytes,p);p+=4;
    const sl=varint(bytes,p);p=sl.pos;
    const scriptLen=safeCount(sl.value,"scriptSig",10000000);
    if(p+scriptLen+4>bytes.length)throw new Error("EOF input script/sequence.");
    const scriptSig=bytes.slice(p,p+scriptLen);p+=scriptLen;
    const sequence=u32le(bytes,p);p+=4;
    inputs.push({prevTxid,vout,scriptSig:hex(scriptSig),sequence,witness:[]});
    vinSerialized.push(bytes.slice(vinStart,p));
  }

  const voutCountVar=varint(bytes,p);p=voutCountVar.pos;
  const voutCount=safeCount(voutCountVar.value,"vout",100000);
  const outputs=[],voutSerialized=[];

  for(let i=0;i<voutCount;i++){
    const outStart=p;
    if(p+8>bytes.length)throw new Error("EOF output value.");
    const valueSats=u64le(bytes,p);p+=8;
    const sl=varint(bytes,p);p=sl.pos;
    const scriptLen=safeCount(sl.value,"scriptPubKey",10000000);
    if(p+scriptLen>bytes.length)throw new Error("EOF output script.");
    const script=bytes.slice(p,p+scriptLen);p+=scriptLen;
    outputs.push({
      n:i,
      valueSats:valueSats.toString(),
      valueBTC:Number(valueSats)/100000000,
      scriptPubKey:hex(script),
      scriptType:scriptClass(script),
      opReturn:opReturn(script)
    });
    voutSerialized.push(bytes.slice(outStart,p));
  }

  if(segwit){
    for(let i=0;i<inputs.length;i++){
      const wc=varint(bytes,p);p=wc.pos;
      const n=safeCount(wc.value,"witness item",100000);
      for(let j=0;j<n;j++){
        const wl=varint(bytes,p);p=wl.pos;
        const len=safeCount(wl.value,"witness bytes",10000000);
        if(p+len>bytes.length)throw new Error("EOF witness.");
        inputs[i].witness.push(hex(bytes.slice(p,p+len)));p+=len;
      }
    }
  }

  if(p+4>bytes.length) throw new Error("EOF locktime.");
  const locktime=u32le(bytes,p);p+=4;
  const full=bytes.slice(start,p);

  let stripped=full;
  if(segwit){
    stripped=concat(
      bytes.slice(start,start+4),
      vinCountVar.raw,
      ...vinSerialized,
      voutCountVar.raw,
      ...voutSerialized,
      encodeU32(locktime)
    );
  }

  return {
    tx:{
      version,segwit,vin:inputs,vout:outputs,locktime,
      size:full.length,
      strippedSize:stripped.length,
      weight:stripped.length*3+full.length,
      vsize:Math.ceil((stripped.length*3+full.length)/4),
      txid:await hashDisplay(stripped),
      wtxid:await hashDisplay(full),
      rawHex:hex(full)
    },
    pos:p
  };
}

async function parseBlock(raw) {
  if(raw.length<81)throw new Error("Raw block is too short.");
  const header=raw.slice(0,80);
  const version=i32le(header,0);
  const prevBlock=hex(reverse(header.slice(4,36)));
  const merkleRoot=hex(reverse(header.slice(36,68)));
  const time=u32le(header,68),bits=u32le(header,72),nonce=u32le(header,76);
  const hash=await hashDisplay(header);
  let p=80;
  const tv=varint(raw,p);p=tv.pos;
  const n=safeCount(tv.value,"transaction",1000000);
  const txs=[];
  for(let i=0;i<n;i++){
    const r=await parseTransaction(raw,p);p=r.pos;txs.push(r.tx);
  }
  return {
    hash,version,prevBlock,merkleRoot,time,bits:bits.toString(16).padStart(8,"0"),nonce,
    txCount:n,transactions:txs,bytes:p,rawBytes:raw.length,trailingBytes:raw.length-p
  };
}

function splitBlkDat(bytes, magicHex, maxBlocks=64) {
  const magic=Uint8Array.from(magicHex.match(/../g).map(x=>parseInt(x,16)));
  const out=[];
  let p=0;
  while(p+8<=bytes.length && out.length<maxBlocks){
    let found=-1;
    for(let i=p;i+4<=bytes.length;i++){
      if(bytes[i]===magic[0]&&bytes[i+1]===magic[1]&&bytes[i+2]===magic[2]&&bytes[i+3]===magic[3]){found=i;break;}
    }
    if(found<0)break;
    if(found+8>bytes.length)break;
    const size=u32le(bytes,found+4);
    const start=found+8,end=start+size;
    if(size<80||end>bytes.length){p=found+1;continue;}
    out.push({offset:found,size,raw:bytes.slice(start,end)});
    p=end;
  }
  return out;
}

async function parseInput(bytes,{format="auto",magicHex="f9beb4d9",maxBlocks=64}={}){
  let wrapped=[];
  if(format==="raw") wrapped=[{offset:0,size:bytes.length,raw:bytes}];
  else {
    wrapped=splitBlkDat(bytes,magicHex,maxBlocks);
    if(format==="auto"&&!wrapped.length) wrapped=[{offset:0,size:bytes.length,raw:bytes}];
    if(format==="blkdat"&&!wrapped.length)throw new Error("No matching blk*.dat records found.");
  }
  const blocks=[];
  for(const w of wrapped.slice(0,maxBlocks)){
    const b=await parseBlock(w.raw);b.fileOffset=w.offset;b.recordSize=w.size;blocks.push(b);
  }
  return blocks;
}

window.BitcoinBlockParser=Object.freeze({hex,reverse,u32le,u64le,varint,scriptClass,opReturn,parseTransaction,parseBlock,splitBlkDat,parseInput});
})();
