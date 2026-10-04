(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicTxFetcher?.__version>=3)return;
  const caches={tx:new Map(),hex:new Map(),block:new Map()};
  function endpoint(cfg,key,value){return cfg.endpoints[key].replace("{txid}",encodeURIComponent(value)).replace("{hash}",encodeURIComponent(value))}
  async function cached(map,key,ttl,loader,force=false){const old=map.get(key);if(!force&&old&&Date.now()-old.at<ttl)return old.value;const value=await loader();map.set(key,{at:Date.now(),value});return value}
  async function tx(core,txid,{signal,force=false}={}){const cfg=W.ZZXMempoolMosaicSources.get(core);return cached(caches.tx,txid,180000,()=>W.ZZXMempoolMosaicFetch.fetchJSON(endpoint(cfg,"tx",txid),{signal,ttlMs:0}),force)}
  async function hex(core,txid,{signal,force=false}={}){const cfg=W.ZZXMempoolMosaicSources.get(core);try{return await cached(caches.hex,txid,600000,()=>W.ZZXMempoolMosaicFetch.fetchText(endpoint(cfg,"txHex",txid),{signal,ttlMs:0}),force)}catch(error){if(error?.name==="AbortError")throw error;return ""}}
  async function block(core,hash,{signal,force=false}={}){const cfg=W.ZZXMempoolMosaicSources.get(core);try{return await cached(caches.block,hash,600000,()=>W.ZZXMempoolMosaicFetch.fetchJSON(endpoint(cfg,"block",hash),{signal,ttlMs:0}),force)}catch(error){if(error?.name==="AbortError")throw error;return null}}
  async function inspect(core,txid,{signal,force=false,entry=null,tipHeight=NaN,btcUsd=NaN}={}){const transaction=await tx(core,txid,{signal,force});if(!transaction)throw new Error("transaction unavailable");const [rawHex,blockInfo]=await Promise.all([hex(core,txid,{signal,force}),transaction?.status?.confirmed&&transaction?.status?.block_hash?block(core,transaction.status.block_hash,{signal,force}):Promise.resolve(null)]);return W.ZZXMempoolMosaicAnalyzer.analyze(transaction,{rawHex,block:blockInfo,entry,tipHeight,btcUsd})}
  W.ZZXMempoolMosaicTxFetcher=Object.freeze({__version:3,tx,hex,block,inspect});
})();
