// __partials/widgets/mempool-specs/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsProvider?.__version>=6)return;

  async function j(url,opts={}){
    const r=await W.ZZXMempoolSpecsFetch.fetchJSON(url,opts);
    return r?.json??r;
  }

  async function t(url,opts={}){
    const r=await W.ZZXMempoolSpecsFetch.fetchText(url,opts);
    return r?.text??r;
  }

  function positive(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>0?n:NaN;
  }

  function marketStatePrice(){
    const state=W.ZZXMarketState;
    let snap=null;

    try{
      snap=typeof state?.getSnapshot==="function"
        ? state.getSnapshot()
        : (state?.snapshot||state?.current||state);
    }catch(_error){
      snap=state;
    }

    for(const value of [
      snap?.effectivePriceUsd,
      snap?.effective_price_usd,
      state?.effectivePriceUsd,
      state?.effective_price_usd
    ]){
      const n=positive(value);
      if(Number.isFinite(n)){
        return {value:n,source:"ZZX Market State"};
      }
    }

    return null;
  }

  async function price(url){
    const shared=marketStatePrice();
    if(shared)return shared;

    try{
      const data=await j(url,{ttlMs:5000});
      const value=positive(
        data?.price_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );

      return {
        value,
        source:data?.source||"ZZX Global BPI"
      };
    }catch(_error){
      return {value:NaN,source:"price unavailable"};
    }
  }

  async function inlineFullFeed(){
    const feed=
      W.ZZXMempoolSpecsFullFeed ??
      W.ZZXMempoolFullFeed;

    if(!feed)return null;

    try{
      const value=typeof feed==="function"?await feed():feed;
      return value&&typeof value==="object"
        ? {data:value,source:"window.ZZXMempoolSpecsFullFeed"}
        : null;
    }catch(_error){
      return null;
    }
  }

  async function remoteFullFeed(cfg,signal){
    const inline=await inlineFullFeed();
    if(inline)return inline;

    for(const url of cfg.fullFeedUrls||[]){
      try{
        const data=await j(url,{signal,ttlMs:10000});
        if(data&&typeof data==="object"){
          return {data,source:url};
        }
      }catch(_error){
        // Optional. Public mempool.space REST mode can progressively hydrate
        // real transaction rows without this source.
      }
    }

    return null;
  }

  async function optionalJSON(url,{signal,ttlMs=5000}={}){
    try{
      return await j(url,{signal,ttlMs});
    }catch(_error){
      return null;
    }
  }

  async function load(core,{signal,force=false}={}){
    const cfg=W.ZZXMempoolSpecsSources.get(core);
    const ttl=force?0:5000;

    const jobs={
      mempool:optionalJSON(cfg.endpoints.mempool,{signal,ttlMs:ttl}),
      blocks:optionalJSON(cfg.endpoints.blocks,{signal,ttlMs:ttl}),
      recommended:optionalJSON(cfg.endpoints.recommended,{signal,ttlMs:ttl}),
      tip:(async()=>{
        try{return await t(cfg.endpoints.tipHeight,{signal,ttlMs:ttl})}
        catch(_error){return null}
      })(),
      txids:optionalJSON(cfg.endpoints.txids,{signal,ttlMs:force?0:10000}),
      recent:optionalJSON(cfg.endpoints.recent,{signal,ttlMs:force?0:5000}),
      spot:price(cfg.price),
      full:remoteFullFeed(cfg,signal)
    };

    const keys=Object.keys(jobs);
    const settled=await Promise.allSettled(keys.map(key=>jobs[key]));
    const out={};

    settled.forEach((result,index)=>{
      out[keys[index]]=result.status==="fulfilled"
        ? result.value
        : null;
    });

    if(!out.mempool&&!out.blocks&&!out.full&&!out.txids){
      throw new Error("mempool transaction data unavailable");
    }

    const tipHeight=Number(String(out.tip??"").trim());
    const txids=Array.isArray(out.txids)
      ? out.txids.map(String).filter(Boolean)
      : [];

    const recent=Array.isArray(out.recent)
      ? out.recent.filter(row=>row&&typeof row==="object")
      : [];

    return {
      cfg,
      mempool:out.mempool&&typeof out.mempool==="object"?out.mempool:null,
      blocks:Array.isArray(out.blocks)?out.blocks:[],
      feeRecommendations:out.recommended&&typeof out.recommended==="object"
        ? out.recommended
        : null,
      txids,
      recent,
      fullFeed:out.full?.data||null,
      fullFeedSource:out.full?.source||"",
      tipHeight:Number.isFinite(tipHeight)?tipHeight:NaN,
      priceUsd:out.spot?.value??NaN,
      priceSource:out.spot?.source||"price unavailable",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolSpecsProvider=Object.freeze({
    __version:6,
    load,
    marketStatePrice
  });
})();
