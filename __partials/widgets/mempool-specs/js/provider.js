// __partials/widgets/mempool-specs/js/provider.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolSpecsProvider?.__version>=4)return;

  async function j(url,opts={}){
    return (await W.ZZXMempoolSpecsFetch.fetchJSON(url,opts)).json;
  }
  async function t(url,opts={}){
    return (await W.ZZXMempoolSpecsFetch.fetchText(url,opts)).text;
  }

  function positive(v){
    const n=Number(v);
    return Number.isFinite(n)&&n>0?n:NaN;
  }

  function marketStatePrice(){
    const state=W.ZZXMarketState;
    let snap=null;
    try{
      snap=typeof state?.getSnapshot==="function"?state.getSnapshot():(state?.snapshot||state?.current||state);
    }catch(_){snap=state}
    const values=[
      snap?.effectivePriceUsd,
      snap?.effective_price_usd,
      state?.effectivePriceUsd,
      state?.effective_price_usd
    ];
    for(const value of values){
      const n=positive(value);
      if(Number.isFinite(n))return {value:n,source:"ZZX Market State"};
    }
    return null;
  }

  async function price(url){
    const shared=marketStatePrice();
    if(shared)return shared;
    try{
      const data=await j(url,{ttlMs:5000});
      const value=positive(data?.price_usd??data?.bpi_usd??data?.vwap_usd);
      return {value,source:data?.source||"ZZX Global BPI"};
    }catch(_){return {value:NaN,source:"price unavailable"}}
  }

  async function inlineFullFeed(){
    const feed=W.ZZXMempoolSpecsFullFeed;
    if(!feed)return null;
    try{
      const value=typeof feed==="function"?await feed():feed;
      return value&&typeof value==="object"?{data:value,source:"window.ZZXMempoolSpecsFullFeed"}:null;
    }catch(_){return null}
  }

  async function remoteFullFeed(cfg,signal){
    const inline=await inlineFullFeed();
    if(inline)return inline;
    for(const url of cfg.fullFeedUrls||[]){
      try{
        const data=await j(url,{signal,ttlMs:10000});
        if(data&&typeof data==="object")return {data,source:url};
      }catch(_){/* optional source */}
    }
    return null;
  }

  async function load(core,{signal,force=false}={}){
    const cfg=W.ZZXMempoolSpecsSources.get(core);
    const txidTtl=force?0:cfg.txidRefreshMs;

    const tasks={
      mempool:j(cfg.endpoints.mempool,{signal,ttlMs:force?0:5000}),
      txids:j(cfg.endpoints.txids,{signal,ttlMs:txidTtl}),
      recent:j(cfg.endpoints.recent,{signal,ttlMs:force?0:5000}),
      blocks:j(cfg.endpoints.blocks,{signal,ttlMs:force?0:5000}),
      recommended:j(cfg.endpoints.recommended,{signal,ttlMs:force?0:5000}),
      tip:t(cfg.endpoints.tipHeight,{signal,ttlMs:force?0:5000}),
      spot:price(cfg.price),
      full:remoteFullFeed(cfg,signal)
    };

    const keys=Object.keys(tasks);
    const settled=await Promise.allSettled(keys.map(k=>tasks[k]));
    const out={};
    settled.forEach((r,i)=>{out[keys[i]]=r.status==="fulfilled"?r.value:null});

    if(!out.mempool&&!out.txids&&!out.full){
      const error=settled.find(r=>r.status==="rejected")?.reason;
      throw error||new Error("mempool transaction universe unavailable");
    }

    const tipHeight=Number(String(out.tip??"").trim());
    const txids=Array.isArray(out.txids)?out.txids.filter(x=>typeof x==="string"):[];
    const recent=Array.isArray(out.recent)?out.recent:[];
    const blocks=Array.isArray(out.blocks)?out.blocks:[];

    return {
      cfg,
      mempool:out.mempool&&typeof out.mempool==="object"?out.mempool:null,
      txids,
      recent,
      blocks,
      feeRecommendations:out.recommended&&typeof out.recommended==="object"?out.recommended:null,
      fullFeed:out.full?.data||null,
      fullFeedSource:out.full?.source||"",
      tipHeight:Number.isFinite(tipHeight)?tipHeight:NaN,
      priceUsd:out.spot?.value??NaN,
      priceSource:out.spot?.source||"price unavailable",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolSpecsProvider=Object.freeze({__version:4,load,marketStatePrice});
})();
