// __partials/widgets/mempool-specs/js/txfetcher.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TxFetcher?.__version>=6)return;

  function pool(items,concurrency,fn,signal){
    let next=0;
    const out=new Array(items.length);

    async function worker(){
      while(true){
        if(signal?.aborted)throw new DOMException("Aborted","AbortError");
        const index=next++;
        if(index>=items.length)return;
        try{out[index]=await fn(items[index],index)}
        catch(error){
          if(error?.name==="AbortError")throw error;
          out[index]=null;
        }
      }
    }

    const count=Math.max(1,Math.min(8,Number(concurrency)||4));
    return Promise.all(Array.from({length:count},worker)).then(()=>out);
  }

  class TxFetcher{
    constructor(opts={}){
      this.base=String(opts.base||"https://mempool.space/api").replace(/\/+$/g,"");
      this.fetchJSON=opts.fetchJSON||W.ZZXMempoolSpecsFetch?.fetchJSON;
      this.fetchText=opts.fetchText||W.ZZXMempoolSpecsFetch?.fetchText;
      this.ttl=Number.isFinite(opts.txTtlMs)?opts.txTtlMs:180000;
      this.hexTtl=Number.isFinite(opts.hexTtlMs)?opts.hexTtlMs:600000;
      this.blockTtl=Number.isFinite(opts.blockTtlMs)?opts.blockTtlMs:600000;
      this.concurrency=Number.isFinite(opts.concurrency)?opts.concurrency:4;
      this.txCache=new Map();
      this.hexCache=new Map();
      this.blockCache=new Map();
      this.inflight=new Map();
    }

    txUrl(txid){
      return `${this.base}/tx/${encodeURIComponent(txid)}`;
    }

    hexUrl(txid){
      return `${this.base}/tx/${encodeURIComponent(txid)}/hex`;
    }

    blockUrl(hash){
      return `${this.base}/block/${encodeURIComponent(hash)}`;
    }

    async _cached(cache,key,ttl,load,force=false){
      const current=cache.get(key);
      if(!force&&current&&Date.now()-current.at<ttl)return current.value;

      const inflightKey=`${cache===this.txCache?"tx":cache===this.hexCache?"hex":"block"}:${key}`;
      if(this.inflight.has(inflightKey))return await this.inflight.get(inflightKey);

      const task=(async()=>{
        const value=await load();
        cache.set(key,{at:Date.now(),value});
        return value;
      })();

      this.inflight.set(inflightKey,task);
      try{return await task}
      finally{this.inflight.delete(inflightKey)}
    }

    async tx(txid,{force=false,signal}={}){
      const id=String(txid||"");
      if(!id)return null;

      return await this._cached(
        this.txCache,
        id,
        this.ttl,
        async()=>{
          const result=await this.fetchJSON(this.txUrl(id),{signal,ttlMs:0});
          return result?.json??result;
        },
        force
      );
    }

    async hex(txid,{force=false,signal}={}){
      const id=String(txid||"");
      if(!id)return "";

      try{
        return await this._cached(
          this.hexCache,
          id,
          this.hexTtl,
          async()=>{
            const result=await this.fetchText(this.hexUrl(id),{signal,ttlMs:0});
            return String(result?.text??result??"").trim();
          },
          force
        );
      }catch(error){
        if(error?.name==="AbortError")throw error;
        return "";
      }
    }

    async block(hash,{force=false,signal}={}){
      const id=String(hash||"");
      if(!id)return null;

      try{
        return await this._cached(
          this.blockCache,
          id,
          this.blockTtl,
          async()=>{
            const result=await this.fetchJSON(this.blockUrl(id),{signal,ttlMs:0});
            return result?.json??result;
          },
          force
        );
      }catch(error){
        if(error?.name==="AbortError")throw error;
        return null;
      }
    }

    async txBatch(txids,{limit=24,concurrency=this.concurrency,signal}={}){
      const ids=[...new Set((txids||[]).map(String).filter(Boolean))].slice(0,Math.max(0,limit));
      const values=await pool(
        ids,
        concurrency,
        id=>this.tx(id,{signal}),
        signal
      );

      return new Map(
        ids.map((id,index)=>[id,values[index]])
          .filter(([,value])=>value&&typeof value==="object")
      );
    }

    async inspect(txid,{signal,tipHeight=NaN,btcUsd=NaN,entry=null,force=false}={}){
      const tx=await this.tx(txid,{signal,force});
      if(!tx)throw new Error(`transaction ${txid} unavailable`);

      const [rawHex,block]=await Promise.all([
        this.hex(txid,{signal,force}),
        tx?.status?.confirmed&&tx?.status?.block_hash
          ? this.block(tx.status.block_hash,{signal,force})
          : Promise.resolve(null)
      ]);

      return await NS.TxAnalyzer.analyze(tx,{
        tipHeight,
        btcUsd,
        rawHex,
        block,
        entry
      });
    }
  }

  TxFetcher.__version=6;
  NS.TxFetcher=TxFetcher;
})();
