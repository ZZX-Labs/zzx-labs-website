(()=>{"use strict";
function push16(a,n){a.push(n&255,(n>>8)&255)}
function palette332(){const p=[];for(let i=0;i<256;i++){const r=(i>>5)&7,g=(i>>2)&7,b=i&3;p.push(Math.round(r*255/7),Math.round(g*255/7),Math.round(b*255/3))}return p}
function quant332(data){const out=new Uint8Array(data.length/4);for(let i=0,j=0;i<data.length;i+=4,j++)out[j]=((data[i]>>5)<<5)|((data[i+1]>>5)<<2)|(data[i+2]>>6);return out}
function lzw(indices,minCodeSize=8){
 const clear=1<<minCodeSize,end=clear+1;let codeSize=minCodeSize+1,next=end+1,dict=new Map(),out=[],cur=0,bits=0;
 const reset=()=>{dict=new Map();codeSize=minCodeSize+1;next=end+1};
 const emit=code=>{cur|=code<<bits;bits+=codeSize;while(bits>=8){out.push(cur&255);cur>>>=8;bits-=8}};
 reset();emit(clear);
 if(!indices.length){emit(end);if(bits)out.push(cur&255);return new Uint8Array(out)}
 let prefix=String(indices[0]);
 for(let i=1;i<indices.length;i++){
   const k=indices[i],key=prefix+","+k;
   if(dict.has(key)){prefix=String(dict.get(key));continue}
   emit(+prefix);
   if(next<4096){dict.set(key,next++);if(next===(1<<codeSize)&&codeSize<12)codeSize++}
   else{emit(clear);reset()}
   prefix=String(k)
 }
 emit(+prefix);emit(end);if(bits>0)out.push(cur&255);return new Uint8Array(out)
}
function blocks(a,bytes){for(let i=0;i<bytes.length;i+=255){const n=Math.min(255,bytes.length-i);a.push(n);for(let j=0;j<n;j++)a.push(bytes[i+j])}a.push(0)}
function encode(frames,w,h,delayCs=10,loop=0){
 const a=[71,73,70,56,57,97];push16(a,w);push16(a,h);a.push(0xF7,0,0,...palette332());
 a.push(0x21,0xFF,0x0B,...[..."NETSCAPE2.0"].map(c=>c.charCodeAt(0)),0x03,0x01);push16(a,loop);a.push(0);
 for(const frame of frames){
  a.push(0x21,0xF9,0x04,0x00);push16(a,delayCs);a.push(0,0);
  a.push(0x2C);push16(a,0);push16(a,0);push16(a,w);push16(a,h);a.push(0);
  a.push(8);blocks(a,lzw(quant332(frame.data),8))
 }
 a.push(0x3B);return new Uint8Array(a)
}
window.GIF332=Object.freeze({encode});
})();
