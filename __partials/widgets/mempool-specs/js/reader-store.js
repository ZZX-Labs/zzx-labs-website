(function(){
  "use strict";
  const W=window,NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});if(NS.ReaderStore?.__version>=1)return;
  const META="zzx:mempool-specs:readers:v1",MAX=48;let memory=new Map();
  function metas(){try{return JSON.parse(localStorage.getItem(META)||"[]")}catch(_){return []}}
  function write(rows){try{localStorage.setItem(META,JSON.stringify(rows.slice(0,MAX)))}catch(_){}return rows.slice(0,MAX)}
  function db(){return new Promise((resolve,reject)=>{if(!indexedDB)return reject(new Error("IndexedDB unavailable"));const r=indexedDB.open("zzx-mempool-specs",1);r.onupgradeneeded=()=>r.result.createObjectStore("readers",{keyPath:"txid"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function put(bundle,entry={}){const txid=String(bundle?.txid||entry?.txid||"");if(!txid)return;const row={txid,openedAt:Date.now(),valueSats:Number(entry.valueSats),feeRate:Number(entry.packageFeeRate??entry.feeRate),confirmed:!!bundle?.status?.confirmed};write([row,...metas().filter(x=>x.txid!==txid)]);memory.set(txid,bundle);try{const d=await db(),t=d.transaction("readers","readwrite");t.objectStore("readers").put({txid,bundle,savedAt:Date.now()});await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error)});d.close()}catch(_){}return row}
  async function get(txid){if(memory.has(txid))return memory.get(txid);try{const d=await db(),t=d.transaction("readers"),r=t.objectStore("readers").get(txid),row=await new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});d.close();if(row?.bundle)memory.set(txid,row.bundle);return row?.bundle||null}catch(_){return null}}
  async function remove(txid){memory.delete(txid);write(metas().filter(x=>x.txid!==txid));try{const d=await db(),t=d.transaction("readers","readwrite");t.objectStore("readers").delete(txid);d.close()}catch(_){}}
  NS.ReaderStore=Object.freeze({__version:1,list:metas,put,get,remove});
})();
