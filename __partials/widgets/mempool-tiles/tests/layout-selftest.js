"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.resolve(__dirname,"..");
const assert=(c,m)=>{if(!c)throw new Error(m)};
const ctx={console,Map,Set,Date,Math,Number,String,Array,Object,JSON,Intl,Int32Array};ctx.window=ctx;vm.createContext(ctx);
for(const f of ["js/sorter.js","js/scaler.js","js/layout.js"])vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),ctx,{filename:f});
function tx(i){const id=i.toString(16).padStart(64,"0");return {txid:id,id,vsize:100+i,valueSats:1000+i*100,feeRate:1+i,packageFeeRate:1+i,rank:i}}
for(const count of [1,2,3,4,5,8,9,10,16,17,31,64,127,512,1000,3000,5000]){
 const candidate=Array.from({length:count},(_,i)=>tx(i+1));
 const layout=ctx.ZZXMempoolTilesLayout.build({candidate,candidateVsize:candidate.reduce((s,r)=>s+r.vsize,0),targetVbytes:1_000_000},{scaleMode:"vsize",sortMode:"priority",seed:1});
 assert(layout.tiles.length===count,`tile count ${count}`);
 assert(layout.gridN===Math.ceil(Math.sqrt(count)),`gridN ${count}`);
 assert(layout.spatial.length===layout.gridN*layout.gridN,`spatial ${count}`);
 for(const tile of layout.tiles){
   assert(tile.side>0&&tile.side<=tile.cellSide+1e-12,`square side ${count}`);
   assert(Math.abs((tile.x+tile.side/2)-tile.cx)<1e-12,`center x ${count}`);
   assert(Math.abs((tile.y+tile.side/2)-tile.cy)<1e-12,`center y ${count}`);
   const hit=ctx.ZZXMempoolTilesLayout.hit(layout,tile.cx,tile.cy);
   assert(hit?.txid===tile.txid,`hit ${count}`);
 }
}
console.log("Mempool Tiles grid layout self-test: PASS");
