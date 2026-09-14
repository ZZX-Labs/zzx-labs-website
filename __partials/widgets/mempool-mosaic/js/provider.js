(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicProvider?.__version>=4)return;

  async function optionalJSON(url,{signal,ttlMs=5000}={}){try{return await W.ZZXMempoolMosaicFetch.fetchJSON(url,{signal,ttlMs})}catch(_){return null}}
  async function optionalText(url,{signal,ttlMs=5000}={}){try{return await W.ZZXMempoolMosaicFetch.fetchText(url,{signal,ttlMs})}catch(_){return null}}

  function marketPrice(){
    const state=W.ZZXMarketState;let snap=null;
    try{snap=typeof state?.getSnapshot==="function"?state.getSnapshot():(state?.snapshot||state?.current||state)}catch(_){snap=state}
    for(const value of [snap?.effectivePriceUsd,snap?.effective_price_usd,state?.effectivePriceUsd,state?.effective_price_usd]){const n=Number(value);if(Number.isFinite(n)&&n>0)return {value:n,source:"ZZX Market State"}}
    return null;
  }

  async function price(url,signal){
    const shared=marketPrice();if(shared)return shared;
    const data=await optionalJSON(url,{signal,ttlMs:5000});
    const value=Number(data?.price_usd??data?.bpi_usd??data?.vwap_usd);
    return {value:Number.isFinite(value)&&value>0?value:NaN,source:data?.source||"ZZX Global BPI"};
  }

  async function fullFeed(cfg,signal){
    const inline=W.ZZXMempoolMosaicFullFeed??W.ZZXMempoolFullFeed;
    if(inline){
      try{const value=typeof inline==="function"?await inline():inline;if(value&&typeof value==="object")return {data:value,source:"window.ZZXMempoolMosaicFullFeed"}}catch(_){}
    }
    for(const url of cfg.fullFeedUrls||[]){
      try{const data=await W.ZZXMempoolMosaicFetch.fetchJSON(url,{signal,ttlMs:10000,timeoutMs:6500,retries:0});if(data&&typeof data==="object")return {data,source:url}}catch(_){}
    }
    return null;
  }

  async function load(core,{signal,force=false}={}){
    const cfg=W.ZZXMempoolMosaicSources.get(core),ttl=force?0:5000;
    const jobs={
      mempool:optionalJSON(cfg.endpoints.mempool,{signal,ttlMs:ttl}),
      blocks:optionalJSON(cfg.endpoints.blocks,{signal,ttlMs:ttl}),
      recommended:optionalJSON(cfg.endpoints.recommended,{signal,ttlMs:ttl}),
      tip:optionalText(cfg.endpoints.tipHeight,{signal,ttlMs:ttl}),
      recent:optionalJSON(cfg.endpoints.recent,{signal,ttlMs:force?0:5000}),
      full:fullFeed(cfg,signal),
      spot:price(cfg.price,signal)
    };
    const keys=Object.keys(jobs),settled=await Promise.allSettled(keys.map(k=>jobs[k])),out={};
    settled.forEach((r,i)=>out[keys[i]]=r.status==="fulfilled"?r.value:null);
    if(!out.mempool&&!out.blocks&&!out.full)throw new Error("mempool REST data unavailable");
    const tip=Number(String(out.tip??"").trim());
    return Object.freeze({
      cfg,
      mempool:out.mempool&&typeof out.mempool==="object"?out.mempool:null,
      blocks:Array.isArray(out.blocks)?out.blocks:[],
      recommended:out.recommended&&typeof out.recommended==="object"?out.recommended:null,
      recent:Array.isArray(out.recent)?out.recent.filter(Boolean):[],
      fullFeed:out.full?.data||null,
      fullFeedSource:out.full?.source||"",
      tipHeight:Number.isFinite(tip)?tip:NaN,
      priceUsd:out.spot?.value??NaN,
      priceSource:out.spot?.source||"price unavailable",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    });
  }

  W.ZZXMempoolMosaicProvider=Object.freeze({__version:4,load,marketPrice});
})();
