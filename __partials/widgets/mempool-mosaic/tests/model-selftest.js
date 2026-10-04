#!/usr/bin/env node
"use strict";
global.window=global;require('../js/model.js');const M=global.ZZXMempoolMosaicModel;
const assert=(c,m)=>{if(!c)throw new Error(m)};const id=n=>n.toString(16).padStart(64,'0').slice(-64);
const recent=Array.from({length:20},(_,i)=>({txid:id(i+1),vsize:100+i,fee:2000+i*10,valueSats:100000+i*1000,feeRate:20+i,projectedRank:i}));
let model=M.build({rest:{mempool:{count:50000,vsize:90_000_000},blocks:[{blockVSize:1_000_000,nTx:3000}],tipHeight:900000,fullFeed:recent,source:'selftest',fetchedAt:Date.now(),cfg:{targetVbytes:1_000_000}},live:null,enriched:null});
assert(model.items.length===20,'full-feed fallback projection failed');
const liveRows=recent.slice(5,15).map((r,index)=>({...r,projectedRank:index,__zzxLive:true}));
model=M.build({rest:{mempool:{count:50000,vsize:90_000_000},tipHeight:900000,source:'selftest',fetchedAt:Date.now(),cfg:{targetVbytes:1_000_000}},live:{transactions:liveRows,updatedAt:Date.now()},enriched:null});
assert(model.liveConnected===true,'live mode not activated');assert(model.items.length===10,'live membership size mismatch');assert(model.items.every((r,i)=>r.txid===liveRows[i].txid),'live order not preserved');
console.log('mempool-mosaic model selftest: PASS');
