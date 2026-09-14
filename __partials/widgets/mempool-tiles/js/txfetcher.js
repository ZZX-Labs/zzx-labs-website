(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesTxFetcher?.__version>=2)return;

  const caches={
    tx:new Map(),
    hex:new Map(),
    block:new Map(),
    status:new Map(),
    outspends:new Map(),
    merkle:new Map()
  };

  const cfg=core=>W.ZZXMempoolTilesSources.get(core);
  const endpoint=(core,key,value)=>cfg(core).endpoints[key]
    .replace("{txid}",encodeURIComponent(value))
    .replace("{hash}",encodeURIComponent(value));

  async function cached(kind,key,loader,force=false){
    if(!force&&caches[kind].has(key))return caches[kind].get(key);
    const value=await loader();
    caches[kind].set(key,value);
    return value;
  }

  function tx(core,txid,{signal,force=false}={}){
    return cached("tx",txid,()=>W.ZZXMempoolTilesFetch.json(
      endpoint(core,"tx",txid),{signal,ttlMs:force?0:30000}
    ),force);
  }

  function hex(core,txid,{signal,force=false}={}){
    return cached("hex",txid,()=>W.ZZXMempoolTilesFetch.text(
      endpoint(core,"txHex",txid),{signal,ttlMs:force?0:30000}
    ),force);
  }

  function status(core,txid,{signal,force=false}={}){
    return cached("status",txid,()=>W.ZZXMempoolTilesFetch.json(
      endpoint(core,"txStatus",txid),{signal,ttlMs:force?0:15000}
    ),force);
  }

  function outspends(core,txid,{signal,force=false}={}){
    return cached("outspends",txid,()=>W.ZZXMempoolTilesFetch.json(
      endpoint(core,"txOutspends",txid),{signal,ttlMs:force?0:30000}
    ),force);
  }

  function merkle(core,txid,{signal,force=false}={}){
    return cached("merkle",txid,()=>W.ZZXMempoolTilesFetch.json(
      endpoint(core,"txMerkleProof",txid),{signal,ttlMs:force?0:60000}
    ),force);
  }

  function block(core,hash,{signal,force=false}={}){
    if(!hash)return Promise.resolve(null);
    return cached("block",hash,()=>W.ZZXMempoolTilesFetch.json(
      endpoint(core,"block",hash),{signal,ttlMs:force?0:60000}
    ),force);
  }

  async function full(core,txid,{
    signal,
    force=false,
    tipHeight=NaN,
    priceUsd=NaN,
    tile=null
  }={}){
    const transaction=await tx(core,txid,{signal,force});
    const txStatus=transaction?.status||await status(core,txid,{signal,force}).catch(()=>null);
    const blockHash=String(txStatus?.block_hash||"");

    const [rawHex,blockData,spends,proof]=await Promise.all([
      hex(core,txid,{signal,force}).catch(()=>""),
      txStatus?.confirmed&&blockHash
        ? block(core,blockHash,{signal,force}).catch(()=>null)
        : Promise.resolve(null),
      outspends(core,txid,{signal,force}).catch(()=>[]),
      txStatus?.confirmed
        ? merkle(core,txid,{signal,force}).catch(()=>null)
        : Promise.resolve(null)
    ]);

    return W.ZZXMempoolTilesAnalyzer.analyze(
      {...transaction,status:txStatus||transaction?.status||{}},
      {rawHex,block:blockData,outspends:spends,merkleProof:proof,tipHeight,priceUsd,tile}
    );
  }

  async function batch(core,txids,{signal,concurrency=6,onItem}={}){
    const ids=[...new Set(txids||[])];
    const results=[];
    let cursor=0;

    async function worker(){
      while(cursor<ids.length){
        const index=cursor++;
        const id=ids[index];
        try{
          const data=await tx(core,id,{signal});
          results.push(data);
          onItem?.(data,index);
        }catch(_){}
      }
    }

    await Promise.all(Array.from({length:Math.max(1,Math.min(concurrency,ids.length||1))},worker));
    return results;
  }

  function forget(txid){
    for(const cache of Object.values(caches))cache.delete(txid);
  }

  W.ZZXMempoolTilesTxFetcher=Object.freeze({
    __version:2,
    tx,hex,status,outspends,merkle,block,full,batch,forget
  });
})();
