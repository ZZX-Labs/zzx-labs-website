// __partials/widgets/mempool-specs/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsProvider?.__version>=5)return;

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
    const feed=W.ZZXMempoolSpecsFullFeed;
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
        // Optional source. Public mempool.space mode works without this.
      }
    }

    return null;
  }

  async function load(core,{signal,force=false}={}){
    const cfg=W.ZZXMempoolSpecsSources.get(core);

    const jobs={
      mempool:j(cfg.endpoints.mempool,{signal,ttlMs:force?0:5000}),
      blocks:j(cfg.endpoints.blocks,{signal,ttlMs:force?0:5000}),
      recommended:j(cfg.endpoints.recommended,{signal,ttlMs:force?0:5000}),
      tip:t(cfg.endpoints.tipHeight,{signal,ttlMs:force?0:5000}),
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

    if(!out.mempool&&!out.blocks&&!out.full){
      const firstError=settled.find(result=>result.status==="rejected")?.reason;
      throw firstError||new Error("projected mempool block data unavailable");
    }

    const tipHeight=Number(String(out.tip??"").trim());

    return {
      cfg,
      mempool:out.mempool&&typeof out.mempool==="object"?out.mempool:null,
      blocks:Array.isArray(out.blocks)?out.blocks:[],
      feeRecommendations:out.recommended&&typeof out.recommended==="object"
        ? out.recommended
        : null,
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
    __version:5,
    load,
    marketStatePrice
  });
})();
