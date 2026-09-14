const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={window:{},console};ctx.window.window=ctx.window;vm.createContext(ctx);
for(const f of ['sorter.js','packer.js','layout.js'])vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),ctx,{filename:f});
const W=ctx.window;
function tx(i){return {txid:i.toString(16).padStart(64,'0'),valueSats:(i+1)*(i+7)*1000,vsize:120+(i%400),fee:500+(i%3000),feeRate:2+(i%180),packageFeeRate:2+(i%180),timeMs:1700000000000+i};}
for(const n of [1,2,3,4,5,6,7,8,9,10,11,12,14,15,31,64,81,257,1000,2500,4096]){
  const items=Array.from({length:n},(_,i)=>tx(i+1));
  const layout=W.ZZXMempoolMosaicLayout.build(items,{mode:'mosaic',seed:12345});
  if(layout.sourceCount!==n)throw new Error(`sourceCount ${n}: ${layout.sourceCount}`);
  if(Math.abs(layout.coverage-1)>1e-9)throw new Error(`coverage ${n}: ${layout.coverage}`);
  if(layout.leaves.length!==layout.leafCount)throw new Error(`leafCount ${n}`);
  for(const leaf of layout.leaves){
    if(!(leaf.side>0))throw new Error(`side ${n}`);
    const hit=W.ZZXMempoolMosaicLayout.hit(layout,leaf.cx,leaf.cy);
    if(!hit||hit.txid!==leaf.txid)throw new Error(`hit ${n}`);
  }
}
console.log('mempool-mosaic layout selftest: PASS');
