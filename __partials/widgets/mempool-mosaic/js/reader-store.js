// Local persistent transaction-reader archive (IndexedDB with safe fallback).
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicReaderStore?.__version>=1)return;

  const DB_NAME="zzx-mempool-mosaic-readers";
  const DB_VERSION=1;
  const STORE="readers";
  const FALLBACK_KEY="zzx.mempoolMosaic.readerSummaries.v1";
  const LAST_KEY="zzx.mempoolMosaic.lastReader";
  const memory=new Map();
  let dbPromise=null;

  function storageGet(key,fallback=""){
    try{
      const value=W.localStorage?.getItem(key);
      return value==null?fallback:value;
    }catch(_){return fallback}
  }

  function storageSet(key,value){
    try{W.localStorage?.setItem(key,String(value))}catch(_){}
  }

  function valid(txid){
    return /^[0-9a-f]{64}$/i.test(String(txid||""));
  }

  function requestResult(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("IndexedDB request failed"));
    });
  }

  function database(){
    if(dbPromise)return dbPromise;
    if(!("indexedDB" in W))return Promise.reject(new Error("IndexedDB unavailable"));

    dbPromise=new Promise((resolve,reject)=>{
      const request=W.indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        const store=db.objectStoreNames.contains(STORE)
          ? request.transaction.objectStore(STORE)
          : db.createObjectStore(STORE,{keyPath:"txid"});
        if(!store.indexNames.contains("lastViewedAt"))store.createIndex("lastViewedAt","lastViewedAt");
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Reader database failed"));
      request.onblocked=()=>reject(new Error("Reader database blocked"));
    }).catch(error=>{
      dbPromise=null;
      throw error;
    });

    return dbPromise;
  }

  async function idb(mode,callback){
    const db=await database();
    const transaction=db.transaction(STORE,mode);
    const store=transaction.objectStore(STORE);
    const result=await callback(store);
    await new Promise((resolve,reject)=>{
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error||new Error("Reader transaction failed"));
      transaction.onabort=()=>reject(transaction.error||new Error("Reader transaction aborted"));
    });
    return result;
  }

  function fallbackLoad(){
    try{
      const rows=JSON.parse(storageGet(FALLBACK_KEY,"[]"));
      for(const row of Array.isArray(rows)?rows:[]){
        if(valid(row?.txid)&&!memory.has(row.txid))memory.set(row.txid,row);
      }
    }catch(_){}
  }

  function fallbackSave(){
    const rows=[...memory.values()]
      .sort((a,b)=>Number(b.lastViewedAt||0)-Number(a.lastViewedAt||0))
      .slice(0,64)
      .map(row=>({
        txid:row.txid,
        pinnedAt:row.pinnedAt,
        lastViewedAt:row.lastViewedAt,
        capturedAt:row.capturedAt,
        status:row.status,
        tile:row.tile,
        error:row.error||""
      }));
    storageSet(FALLBACK_KEY,JSON.stringify(rows));
  }

  fallbackLoad();

  function tileSnapshot(tile){
    if(!tile||typeof tile!=="object")return null;
    return {
      txid:String(tile.txid||""),
      rank:Number(tile.rank),
      valueSats:Number(tile.valueSats),
      vsize:Number(tile.vsize),
      feeSats:Number(tile.feeSats),
      feeRate:Number(tile.feeRate),
      packageFeeRate:Number(tile.packageFeeRate),
      firstSeen:Number(tile.firstSeen),
      type:String(tile.type||"unknown"),
      rbf:tile.rbf,
      ordinal:Boolean(tile.ordinal),
      boosted:Boolean(tile.boosted)
    };
  }

  async function get(txid){
    const id=String(txid||"");
    if(!valid(id))return null;
    try{
      const value=await idb("readonly",store=>requestResult(store.get(id)));
      if(value)memory.set(id,value);
      return value||memory.get(id)||null;
    }catch(_){
      return memory.get(id)||null;
    }
  }

  async function list(limit=64){
    let rows;
    try{
      rows=await idb("readonly",store=>requestResult(store.getAll()));
      for(const row of rows)memory.set(row.txid,row);
    }catch(_){
      rows=[...memory.values()];
    }
    return rows
      .sort((a,b)=>Number(b.lastViewedAt||0)-Number(a.lastViewedAt||0))
      .slice(0,Math.max(1,Number(limit)||64));
  }

  async function put(record,limit=64){
    if(!valid(record?.txid))throw new Error("Invalid transaction id");
    const now=Date.now();
    const prior=await get(record.txid);
    const value={
      ...(prior||{}),
      ...record,
      txid:String(record.txid),
      pinnedAt:Number(prior?.pinnedAt||record.pinnedAt||now),
      lastViewedAt:Number(record.lastViewedAt||now)
    };
    memory.set(value.txid,value);

    try{
      await idb("readwrite",store=>requestResult(store.put(value)));
    }catch(_){}

    const rows=await list(Math.max(1,limit)+32);
    for(const stale of rows.slice(Math.max(1,limit))){
      await remove(stale.txid);
    }
    fallbackSave();
    storageSet(LAST_KEY,value.txid);
    return value;
  }

  async function pin(txid,tile,limit=64){
    return put({
      txid:String(txid),
      status:"loading",
      tile:tileSnapshot(tile),
      lastViewedAt:Date.now()
    },limit);
  }

  async function save(analysis,tile,limit=64){
    return put({
      txid:String(analysis?.txid||tile?.txid||""),
      status:"ready",
      capturedAt:Number(analysis?.capturedAt||Date.now()),
      tile:tileSnapshot(tile)||analysis?.tile||null,
      analysis,
      error:"",
      lastViewedAt:Date.now()
    },limit);
  }

  async function fail(txid,error,limit=64){
    return put({
      txid:String(txid),
      status:"error",
      error:String(error?.message||error||"Transaction read failed"),
      lastViewedAt:Date.now()
    },limit);
  }

  async function remove(txid){
    const id=String(txid||"");
    memory.delete(id);
    try{await idb("readwrite",store=>requestResult(store.delete(id)))}catch(_){}
    fallbackSave();
    if(storageGet(LAST_KEY)===id)storageSet(LAST_KEY,"");
  }

  async function clear(){
    memory.clear();
    try{await idb("readwrite",store=>requestResult(store.clear()))}catch(_){}
    fallbackSave();
    storageSet(LAST_KEY,"");
  }

  function last(){
    const value=storageGet(LAST_KEY,"");
    return valid(value)?value:"";
  }

  async function exportAll(){
    return {
      schema:"zzx-mempool-mosaic-reader-export-v1",
      exportedAt:new Date().toISOString(),
      readers:await list(64)
    };
  }

  W.ZZXMempoolMosaicReaderStore=Object.freeze({
    __version:1,
    valid,
    tileSnapshot,
    get,
    list,
    put,
    pin,
    save,
    fail,
    remove,
    clear,
    last,
    exportAll
  });
})();
