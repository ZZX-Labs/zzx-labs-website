(() => {
"use strict";
const te=new TextEncoder(),td=new TextDecoder();
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function b64(b){let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}
function ub64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function sha256(b){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",b)));}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function concat(...arrs){const n=arrs.reduce((s,a)=>s+a.length,0),o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}
function xorFrames(frames,size){const out=new Uint8Array(size);for(const f of frames)for(let i=0;i<f.length;i++)out[i]^=f[i];return out;}
function chunk(bytes,size){const out=[];for(let i=0;i<bytes.length;i+=size)out.push(bytes.slice(i,i+size));return out;}
function bits(bytes){const out=[];for(const b of bytes)for(let i=7;i>=0;i--)out.push((b>>i)&1);return out;}
function drawFrame(canvas,bytes,meta={}){
  const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),w=Math.max(320,Math.round(rect.width||600)),h=Math.max(320,Math.round(rect.height||600)),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
  canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle="#080808";ctx.fillRect(0,0,w,h);
  const payload=bits(bytes),side=Math.ceil(Math.sqrt(payload.length+3*49)),pad=24,cell=Math.max(2,Math.floor(Math.min(w,h)-pad*2)/side),grid=side*cell,ox=(w-grid)/2,oy=(h-grid)/2;
  ctx.fillStyle="#141414";ctx.fillRect(ox,oy,grid,grid);
  function finder(gx,gy){ctx.fillStyle="#c0d674";ctx.fillRect(ox+gx*cell,oy+gy*cell,7*cell,7*cell);ctx.fillStyle="#080808";ctx.fillRect(ox+(gx+1)*cell,oy+(gy+1)*cell,5*cell,5*cell);ctx.fillStyle="#e6a42b";ctx.fillRect(ox+(gx+2)*cell,oy+(gy+2)*cell,3*cell,3*cell);}
  finder(0,0);finder(side-7,0);finder(0,side-7);
  let bi=0;
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const inFinder=(x<7&&y<7)||(x>=side-7&&y<7)||(x<7&&y>=side-7);
    if(inFinder)continue;
    if(payload[bi++]){ctx.fillStyle="#e8e8e8";ctx.fillRect(ox+x*cell,oy+y*cell,cell,cell);}
  }
  ctx.fillStyle="#c0d674";ctx.font="11px monospace";ctx.fillText(`BQRES ${meta.index??0}/${meta.total??1} ${meta.kind||"DATA"}`,12,h-10);
}
function buildFrames(bytes,{chunkSize=256,groupSize=4}={}){
  const data=chunk(bytes,chunkSize),frames=[];let seq=0;
  for(let g=0;g<Math.ceil(data.length/groupSize);g++){
    const group=data.slice(g*groupSize,(g+1)*groupSize);
    group.forEach((p,j)=>frames.push({kind:"data",index:seq++,group:g,slot:j,length:p.length,crc32:crc32(p),payload:b64(p)}));
    const parity=xorFrames(group,chunkSize);
    frames.push({kind:"parity",index:seq++,group:g,slot:group.length,length:chunkSize,crc32:crc32(parity),payload:b64(parity),covers:group.length});
  }
  frames.forEach(f=>f.total=frames.length);
  return frames;
}
function recover(frames,chunkSize=256){
  const byGroup={};for(const f of frames)(byGroup[f.group]??=[]).push(f);
  const data=[];
  for(const g of Object.keys(byGroup).map(Number).sort((a,b)=>a-b)){
    const group=byGroup[g],par=group.find(x=>x.kind==="parity"),d=group.filter(x=>x.kind==="data").sort((a,b)=>a.slot-b.slot);
    if(par){
      const expected=par.covers,slots=new Map(d.map(x=>[x.slot,x]));if(slots.size===expected-1){
        const miss=[...Array(expected).keys()].find(x=>!slots.has(x)),parts=[ub64(par.payload),...d.map(x=>ub64(x.payload))],r=xorFrames(parts,chunkSize);
        slots.set(miss,{kind:"data",group:g,slot:miss,length:miss===expected-1?Math.min(chunkSize,r.length):chunkSize,payload:b64(r),recovered:true});
      }
      if(slots.size<expected)throw new Error(`Group ${g}: insufficient frames for recovery.`);
      for(let i=0;i<expected;i++){const x=slots.get(i),p=ub64(x.payload).slice(0,x.length);if(x.crc32!=null&&crc32(p)!==x.crc32)throw new Error(`Group ${g} slot ${i}: CRC mismatch.`);data.push(p);}
    }else{for(const x of d)data.push(ub64(x.payload).slice(0,x.length));}
  }
  return concat(...data);
}
window.OpticalCore=Object.freeze({te,td,hex,b64,ub64,sha256,crc32,chunk,xorFrames,bits,drawFrame,buildFrames,recover,concat});
})();
