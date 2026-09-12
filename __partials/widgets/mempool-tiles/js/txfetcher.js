// __partials/widgets/mempool-tiles/js/txfetcher.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesTxFetcher?.__version>=1)return;

  const txCache=new Map();
  const hexCache=new Map();
  const blockCache=new Map();

  function cfg(core){
    return W.ZZXMempoolTilesSources.get(core);
  }

  function txUrl(core,txid){
    return cfg(core).endpoints.tx.replace("{txid}",encodeURIComponent(txid));
  }

  function hexUrl(core,txid){
    return cfg(core).endpoints.txHex.replace("{txid}",encodeURIComponent(txid));
  }

  function blockUrl(core,hash){
    return cfg(core).endpoints.block.replace("{hash}",encodeURIComponent(hash));
  }

  async function tx(core,txid,{signal,force=false}={}){
    if(!force&&txCache.has(txid))return txCache.get(txid);
    const data=await W.ZZXMempoolTilesFetch.json(
      txUrl(core,txid),
      {signal,ttlMs:force?0:30000}
    );
    txCache.set(txid,data);
    return data;
  }

  async function hex(core,txid,{signal,force=false}={}){
    if(!force&&hexCache.has(txid))return hexCache.get(txid);
    const data=await W.ZZXMempoolTilesFetch.text(
      hexUrl(core,txid),
      {signal,ttlMs:force?0:30000}
    );
    hexCache.set(txid,data);
    return data;
  }

  async function block(core,hash,{signal,force=false}={}){
    if(!hash)return null;
    if(!force&&blockCache.has(hash))return blockCache.get(hash);
    const data=await W.ZZXMempoolTilesFetch.json(
      blockUrl(core,hash),
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

    return W.ZZXMempoolTilesAnalyzer.analyze(
      transaction,
      {
        rawHex,
        block:blockData,
        tipHeight,
        priceUsd
      }
    );
  }

  async function batch(core,txids,{
    signal,
    concurrency=6,
    onItem
  }={}){
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

  W.ZZXMempoolTilesTxFetcher=Object.freeze({
    __version:1,
    tx,
    hex,
    block,
    full,
    batch
  });
})();
