// __partials/widgets/mempool-tiles/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesProvider?.__version>=1)return;

  const F=()=>W.ZZXMempoolTilesFetch;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function marketPrice(){
    const state=W.ZZXMarketState;
    let snap=null;

    try{
      snap=typeof state?.getSnapshot==="function"
        ? state.getSnapshot()
        : (state?.snapshot||state?.current||state);
    }catch(_){
      snap=state;
    }

    for(const v of [
      snap?.effectivePriceUsd,
      snap?.effective_price_usd,
      state?.effectivePriceUsd,
      state?.effective_price_usd
    ]){
      const n=finite(v);
      if(n>0)return {value:n,source:"ZZX Market State"};
    }

    return null;
  }

  async function price(url){
    const shared=marketPrice();
    if(shared)return shared;

    try{
      const data=await F().json(url,{ttlMs:5000});
      const value=finite(
        data?.price_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );
      return {
        value:value>0?value:NaN,
        source:data?.source||"ZZX Global BPI"
      };
    }catch(_){
      return {value:NaN,source:"price unavailable"};
    }
  }

  async function fullFeed(cfg,signal){
    const inline=
      W.ZZXMempoolTilesFullFeed ??
      W.ZZXMempoolFullFeed;

    if(inline){
      try{
        const data=typeof inline==="function"
          ? await inline()
          : inline;
        if(data&&typeof data==="object"){
          return {data,source:"window.ZZXMempoolTilesFullFeed"};
        }
      }catch(_){}
    }

    for(const url of cfg.fullFeedUrls||[]){
      try{
        const data=await F().json(url,{signal,ttlMs:10000});
        if(data&&typeof data==="object"){
          return {data,source:url};
        }
      }catch(_){}
    }

    return null;
  }

  async function optionalJSON(url,opts){
    try{return await F().json(url,opts)}
    catch(_){return null}
  }

  async function optionalText(url,opts){
    try{return await F().text(url,opts)}
    catch(_){return null}
  }

  async function load(core,{signal,force=false}={}){
    const cfg=W.ZZXMempoolTilesSources.get(core);
    const ttl=force?0:5000;

    const jobs={
      mempool:optionalJSON(cfg.endpoints.mempool,{signal,ttlMs:ttl}),
      blocks:optionalJSON(cfg.endpoints.blocks,{signal,ttlMs:ttl}),
      recommended:optionalJSON(cfg.endpoints.recommended,{signal,ttlMs:ttl}),
      tip:optionalText(cfg.endpoints.tipHeight,{signal,ttlMs:ttl}),
      txids:optionalJSON(cfg.endpoints.txids,{signal,ttlMs:force?0:10000}),
      recent:optionalJSON(cfg.endpoints.recent,{signal,ttlMs:ttl}),
      full:fullFeed(cfg,signal),
      spot:price(cfg.price)
    };

    const keys=Object.keys(jobs);
    const settled=await Promise.allSettled(keys.map(k=>jobs[k]));
    const out={};

    settled.forEach((row,index)=>{
      out[keys[index]]=row.status==="fulfilled"?row.value:null;
    });

    if(!out.mempool&&!out.blocks&&!out.full&&!out.txids){
      throw new Error("mempool data unavailable");
    }

    const tip=finite(String(out.tip??"").trim());

    return {
      cfg,
      mempool:out.mempool&&typeof out.mempool==="object"?out.mempool:null,
      blocks:Array.isArray(out.blocks)?out.blocks:[],
      feeRecommendations:out.recommended&&typeof out.recommended==="object"
        ? out.recommended
        : null,
      tipHeight:tip,
      txids:Array.isArray(out.txids)
        ? out.txids.map(String).filter(id=>/^[0-9a-f]{64}$/i.test(id))
        : [],
      recent:Array.isArray(out.recent)?out.recent:[],
      fullFeed:out.full?.data||null,
      fullFeedSource:out.full?.source||"",
      priceUsd:finite(out.spot?.value),
      priceSource:out.spot?.source||"",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolTilesProvider=Object.freeze({
    __version:1,
    load,
    marketPrice
  });
})();
