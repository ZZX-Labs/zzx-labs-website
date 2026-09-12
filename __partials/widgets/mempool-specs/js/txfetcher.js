// __partials/widgets/mempool-specs/js/txfetcher.js
(function(){
  "use strict";
  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TxFetcher?.__version>=4)return;

  function pool(items,concurrency,fn,signal){
    let next=0;const out=new Array(items.length);
    async function worker(){
      while(true){
        if(signal?.aborted)throw new DOMException("Aborted","AbortError");
        const i=next++;if(i>=items.length)return;
        try{out[i]=await fn(items[i],i)}catch(_){out[i]=null}
      }
    }
    return Promise.all(Array.from({length:Math.max(1,Math.min(8,concurrency||4))},worker)).then(()=>out);
  }

  function decorate(tx,{tipHeight=null,btcUsd=null}={}){
    if(!tx||typeof tx!=="object")return tx;
    const weight=Number(tx.weight);
    const vbytes=Number.isFinite(weight)&&weight>0?Math.ceil(weight/4):Number(tx.vsize??tx.size);
    const fee=Number(tx.fee);
    const feeRate=Number.isFinite(fee)&&Number.isFinite(vbytes)&&vbytes>0?fee/vbytes:NaN;
    let satsOut=NaN;
    if(Array.isArray(tx.vout)){
      let s=0,ok=false;for(const o of tx.vout){const v=Number(o?.value);if(Number.isFinite(v)){s+=v;ok=true}}
      if(ok)satsOut=s;
    }
    const confirmed=!!tx.status?.confirmed;
    const bh=Number(tx.status?.block_height),th=Number(tipHeight);
    const confirmations=confirmed&&Number.isFinite(bh)&&Number.isFinite(th)?Math.max(1,th-bh+1):(confirmed?NaN:0);
    return {...tx,__zzx:{
      vbytes:Number.isFinite(vbytes)?vbytes:NaN,
      feeRate:Number.isFinite(feeRate)?feeRate:NaN,
      satsOut,
      btcOut:Number.isFinite(satsOut)?satsOut/1e8:NaN,
      usdOut:Number.isFinite(satsOut)&&Number.isFinite(Number(btcUsd))?(satsOut/1e8)*Number(btcUsd):NaN,
      feeBtc:Number.isFinite(fee)?fee/1e8:NaN,
      feeUsd:Number.isFinite(fee)&&Number.isFinite(Number(btcUsd))?(fee/1e8)*Number(btcUsd):NaN,
      confirmations
    }};
  }

  class TxFetcher{
    constructor(opts={}){
      this.base=String(opts.base||"https://mempool.space/api").replace(/\/+$/g,"");
      this.fetchJSON=opts.fetchJSON||W.ZZXMempoolSpecsFetch?.fetchJSON;
      this.ttl=Number.isFinite(opts.txTtlMs)?opts.txTtlMs:180000;
      this.concurrency=Number.isFinite(opts.concurrency)?opts.concurrency:4;
      this.cache=new Map();this.inflight=new Map();
    }
    url(txid){return `${this.base}/tx/${encodeURIComponent(txid)}`}
    async tx(txid,{force=false,signal,tipHeight,btcUsd}={}){
      const id=String(txid||"");if(!id)return null;
      const c=this.cache.get(id);if(!force&&c&&Date.now()-c.at<this.ttl)return decorate(c.value,{tipHeight,btcUsd});
      if(this.inflight.has(id))return decorate(await this.inflight.get(id),{tipHeight,btcUsd});
      const task=(async()=>{
        const r=await this.fetchJSON(this.url(id),{signal,ttlMs:0});
        const value=r?.json??r;this.cache.set(id,{at:Date.now(),value});return value;
      })();
      this.inflight.set(id,task);
      try{return decorate(await task,{tipHeight,btcUsd})}
      finally{this.inflight.delete(id)}
    }
    async txBatch(txids,{limit=24,concurrency=this.concurrency,signal,tipHeight,btcUsd}={}){
      const ids=[...new Set((txids||[]).map(String).filter(Boolean))].slice(0,limit);
      const values=await pool(ids,concurrency,id=>this.tx(id,{signal,tipHeight,btcUsd}),signal);
      return new Map(ids.map((id,i)=>[id,values[i]]).filter(([,v])=>v));
    }
  }

  TxFetcher.__version=4;
  NS.TxFetcher=TxFetcher;
})();
