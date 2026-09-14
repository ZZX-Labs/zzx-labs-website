#!/usr/bin/env node
"use strict";

global.window=global;
const local=new Map();
global.localStorage={
  getItem:key=>local.has(key)?local.get(key):null,
  setItem:(key,value)=>local.set(key,String(value))
};
require("../js/reader-store.js");

const S=global.ZZXMempoolMosaicReaderStore;
function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  const txid="ab".repeat(32);
  const tile={txid,rank:3,valueSats:123456789,vsize:321,feeSats:900,feeRate:2.8,packageFeeRate:3.1,firstSeen:1234,type:"p2wpkh",rbf:true};
  await S.pin(txid,tile,64);
  let row=await S.get(txid);
  assert(row?.status==="loading","pin did not persist loading state");
  assert(S.last()===txid,"last reader was not tracked");

  const analysis={txid,capturedAt:Date.now(),tx:{txid,vin:[],vout:[]},feeSats:900,vsize:321};
  await S.save(analysis,tile,64);
  row=await S.get(txid);
  assert(row?.status==="ready","save did not persist ready state");
  assert(row?.analysis?.txid===txid,"analysis was not retained in runtime fallback");

  const exported=await S.exportAll();
  assert(exported.schema==="zzx-mempool-mosaic-reader-export-v1","wrong export schema");
  assert(exported.readers.some(r=>r.txid===txid),"export omitted saved reader");

  await S.clear();
  assert((await S.list()).length===0,"clear did not empty store");
  assert(S.last()==="","clear did not reset last reader");
  console.log("mempool-mosaic reader-store selftest: PASS");
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
