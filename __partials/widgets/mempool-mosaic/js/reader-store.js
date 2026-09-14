(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicReaderStore?.__version>=1)return;

  const DB_NAME="zzx-mempool-mosaic-readers",DB_VERSION=1,STORE="readers";
  const FALLBACK_KEY="zzx.mempoolMosaic.readerSummaries.v1",LAST_KEY="zzx.mempoolMosaic.lastReader";
  const memory=new Map();let dbPromise=null;
  const valid=txid=>/^[0-9a-f]{64}$/i.test(String(txid||""));
  const storageGet=(k,f="")=>{try{const v=W.localStorage?.getItem(k);return v==null?f:v}catch(_){return f}};
  const storageSet=(k,v)=>{try{W.localStorage?.setItem(k,String(v))}catch(_){}};
  const requestResult=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("IndexedDB request failed"))});

  function database(){
    if(dbPromise)return dbPromise;if(!("indexedDB" in W))return Promise.reject(new Error("IndexedDB unavailable"));
    dbPromise=new Promise((resolve,reject)=>{const req=W.indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;const store=db.objectStoreNames.contains(STORE)?req.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:"txid"});if(!store.indexNames.contains("lastViewedAt"))store.createIndex("lastViewedAt","lastViewedAt")};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Reader database failed"));req.onblocked=()=>reject(new Error("Reader database blocked"))}).catch(error=>{dbPromise=null;throw error});return dbPromise;
  }
  async function idb(mode,fn){const db=await database();const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);const result=await fn(store);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Reader transaction failed"));tx.onabort=()=>reject(tx.error||new Error("Reader transaction aborted"))});return result}
  function fallbackLoad(){try{for(const row of JSON.parse(storageGet(FALLBACK_KEY,"[]"))||[]){if(valid(row?.txid))memory.set(row.txid,row)}}catch(_){}}
  function fallbackSave(){const rows=[...memory.values()].sort((a,b)=>Number(b.lastViewedAt||0)-Number(a.lastViewedAt||0)).slice(0,64).map(row=>({txid:row.txid,pinnedAt:row.pinnedAt,lastViewedAt:row.lastViewedAt,capturedAt:row.capturedAt,status:row.status,tile:row.tile,error:row.error||""}));storageSet(FALLBACK_KEY,JSON.stringify(rows))}
  fallbackLoad();
  function tileSnapshot(tile){if(!tile||typeof tile!=="object")return null;return {txid:String(tile.txid||""),valueSats:Number(tile.valueSats),vsize:Number(tile.vsize),feeSats:Number(tile.fee??tile.feeSats),feeRate:Number(tile.feeRate),packageFeeRate:Number(tile.packageFeeRate),firstSeen:Number(tile.firstSeen??tile.timeMs),type:String(tile.type||"unknown")}}
  async function get(txid){const id=String(txid||"");if(!valid(id))return null;try{const value=await idb("readonly",store=>requestResult(store.get(id)));if(value)memory.set(id,value);return value||memory.get(id)||null}catch(_){return memory.get(id)||null}}
  async function list(limit=64){let rows;try{rows=await idb("readonly",store=>requestResult(store.getAll()));for(const row of rows)memory.set(row.txid,row)}catch(_){rows=[...memory.values()]}return rows.sort((a,b)=>Number(b.lastViewedAt||0)-Number(a.lastViewedAt||0)).slice(0,Math.max(1,Number(limit)||64))}
  async function put(record,limit=64){if(!valid(record?.txid))throw new Error("Invalid transaction id");const now=Date.now(),prior=await get(record.txid);const value={...(prior||{}),...record,txid:String(record.txid),pinnedAt:Number(prior?.pinnedAt||record.pinnedAt||now),lastViewedAt:Number(record.lastViewedAt||now)};memory.set(value.txid,value);try{await idb("readwrite",store=>requestResult(store.put(value)))}catch(_){}const rows=await list(limit+32);for(const stale of rows.slice(limit))await remove(stale.txid);fallbackSave();storageSet(LAST_KEY,value.txid);return value}
  const pin=(txid,tile,limit=64)=>put({txid:String(txid),status:"loading",tile:tileSnapshot(tile),lastViewedAt:Date.now()},limit);
  const save=(analysis,tile,limit=64)=>put({txid:String(analysis?.txid||tile?.txid||""),status:"ready",capturedAt:Number(analysis?.capturedAt||Date.now()),tile:tileSnapshot(tile)||analysis?.tile||null,analysis,error:"",lastViewedAt:Date.now()},limit);
  const fail=(txid,error,limit=64)=>put({txid:String(txid),status:"error",error:String(error?.message||error||"Transaction read failed"),lastViewedAt:Date.now()},limit);
  async function remove(txid){const id=String(txid||"");memory.delete(id);try{await idb("readwrite",store=>requestResult(store.delete(id)))}catch(_){}fallbackSave();if(storageGet(LAST_KEY)===id)storageSet(LAST_KEY,"")}
  async function clear(){memory.clear();try{await idb("readwrite",store=>requestResult(store.clear()))}catch(_){}fallbackSave();storageSet(LAST_KEY,"")}
  function last(){const value=storageGet(LAST_KEY,"");return valid(value)?value:""}
  const exportAll=async()=>({schema:"zzx-mempool-mosaic-reader-export-v1",exportedAt:new Date().toISOString(),readers:await list(64)});
  W.ZZXMempoolMosaicReaderStore=Object.freeze({__version:1,valid,tileSnapshot,get,list,put,pin,save,fail,remove,clear,last,exportAll});
})();
