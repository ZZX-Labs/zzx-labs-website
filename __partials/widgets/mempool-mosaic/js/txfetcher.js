// __partials/widgets/mempool-mosaic/js/txfetcher.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicTxFetcher?.__version>=3)return;

  const txCache=new Map();
  const hexCache=new Map();
  const blockCache=new Map();

  function configs(core){
    const S=W.ZZXMempoolMosaicSources;
    return (S?.apiBases?.(core)||[]).map(base=>S.get(core,base));
  }

  async function firstJSON(core,build,{signal,ttlMs}){
    let lastError=null;

    for(const cfg of configs(core)){
      try{
        return await W.ZZXMempoolMosaicFetch.json(
          build(cfg),
          {signal,ttlMs}
        );
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("transaction JSON unavailable");
  }

  async function firstText(core,build,{signal,ttlMs}){
    let lastError=null;

    for(const cfg of configs(core)){
      try{
        return await W.ZZXMempoolMosaicFetch.text(
          build(cfg),
          {signal,ttlMs}
        );
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("transaction text unavailable");
  }

  async function tx(core,txid,{signal,force=false}={}){
    if(!force&&txCache.has(txid))return txCache.get(txid);

    const encoded=encodeURIComponent(txid);
    const data=await firstJSON(
      core,
      cfg=>cfg.endpoints.tx.replace("{txid}",encoded),
      {signal,ttlMs:force?0:30000}
    );

    txCache.set(txid,data);
    return data;
  }

  async function hex(core,txid,{signal,force=false}={}){
    if(!force&&hexCache.has(txid))return hexCache.get(txid);

    const encoded=encodeURIComponent(txid);
    const data=await firstText(
      core,
      cfg=>cfg.endpoints.txHex.replace("{txid}",encoded),
      {signal,ttlMs:force?0:30000}
    );

    hexCache.set(txid,data);
    return data;
  }

  async function block(core,hash,{signal,force=false}={}){
    if(!hash)return null;
    if(!force&&blockCache.has(hash))return blockCache.get(hash);

    const encoded=encodeURIComponent(hash);
    const data=await firstJSON(
      core,
      cfg=>cfg.endpoints.block.replace("{hash}",encoded),
      {signal,ttlMs:force?0:60000}
    );

    blockCache.set(hash,data);
    return data;
  }

  async function full(core,txid,{signal,tipHeight=NaN,priceUsd=NaN}={}){
    const transaction=await tx(core,txid,{signal});

    const [rawHex,blockData]=await Promise.all([
      hex(core,txid,{signal}).catch(()=>""),
      transaction?.status?.confirmed&&transaction?.status?.block_hash
        ? block(core,transaction.status.block_hash,{signal}).catch(()=>null)
        : Promise.resolve(null)
    ]);

    return W.ZZXMempoolMosaicAnalyzer.analyze(
      transaction,
      {
        rawHex,
        block:blockData,
        tipHeight,
        priceUsd
      }
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

    await Promise.all(
      Array.from(
        {length:Math.max(1,Math.min(concurrency,ids.length||1))},
        worker
      )
    );

    return results;
  }

  W.ZZXMempoolMosaicTxFetcher=Object.freeze({
    __version:3,
    tx,
    hex,
    block,
    full,
    batch
  });
})();
