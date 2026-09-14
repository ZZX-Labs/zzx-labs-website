#!/usr/bin/env node
"use strict";

global.window=global;
global.ZZXMempoolMosaicAnalyzer={classify:()=>({kind:"p2wpkh",rbf:false})};
require("../js/model.js");
const M=global.ZZXMempoolMosaicModel;
function assert(c,m){if(!c)throw new Error(m);}
const id=n=>n.toString(16).padStart(64,"0").slice(-64);
const recent=Array.from({length:20},(_,i)=>({txid:id(i+1),vsize:100+i,fee:2000+i*10,valueSats:100000+i*1000,firstSeen:1700000000+i}));
let model=M.build({
  mempool:{count:50000,vsize:90_000_000},
  blocks:[{blockVSize:1_000_000,nTx:3000}],
  tipHeight:900000,
  txids:recent.map(r=>r.txid),
  recent,
  fullFeed:null,
  source:"selftest",
  fetchedAt:Date.now()
});
assert(model.transactions.length===20,"build did not normalize recent transactions");
assert(model.candidate.length===20,"fallback candidate mismatch");
const liveRows=recent.slice(5,15).map((r,index)=>({...r,projectedRank:index,__zzxMosaicLive:true}));
model=M.mergeLive(model,{transactions:liveRows,blocks:[{blockVSize:1_000_000,nTx:10}],updatedAt:Date.now()});
assert(model.liveActive===true,"mergeLive did not activate live mode");
assert(model.candidate.length===10,"live membership size mismatch");
assert(model.candidate.every((r,i)=>r.txid===liveRows[i].txid),"live membership/order not preserved");
const detail={txid:liveRows[0].txid,vsize:222,fee:4444,vout:[{value:123456789}],vin:[]};
model=M.mergeDetails(model,[detail]);
assert(model.byTxid.get(detail.txid).valueSats===123456789,"detail hydration did not update value");
assert(model.candidate.some(r=>r.txid===detail.txid&&r.valueSats===123456789),"hydrated live candidate did not retain detail");
console.log("mempool-mosaic model selftest: PASS");
