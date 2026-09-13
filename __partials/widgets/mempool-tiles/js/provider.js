// __partials/widgets/mempool-tiles/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesProvider?.__version>=2)return;

  const F=()=>W.ZZXMempoolTilesFetch;
  const S=()=>W.ZZXMempoolTilesSources;

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
        data?.vwap_usd ??
        data?.price
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
        if(data&&typeof data==="object")return {data,source:url};
      }catch(_){}
    }

    return null;
  }

  async function optionalJSON(url,opts){
    try{return await F().json(url,opts)}catch(_){return null}
  }

  async function optionalText(url,opts){
    try{return await F().text(url,opts)}catch(_){return null}
  }

  function sharedFallback(core){
    let snapshot=null;

    try{
      snapshot=W.ZZXMempoolVisuals?.current?.() || W.ZZXMempoolVisualsLatest || null;
    }catch(_){
      snapshot=W.ZZXMempoolVisualsLatest||null;
    }

    if(!snapshot)return null;

    const rows=(snapshot.items||[])
      .filter(item=>item?.kind==="tx"&&item?.txid)
      .map(item=>({
        txid:item.txid,
        id:item.txid,
        vsize:item.vbytes,
        vbytes:item.vbytes,
        fee:item.fee,
        value:item.value,
        feeRate:item.feeRate,
        packageFeeRate:item.feeRate,
        firstSeen:item.firstSeenMs,
        projectedBlockIndex:item.blockIndex,
        projectedRank:item.rank
      }));

    if(!rows.length&&!snapshot.summary&&!snapshot.candidateBlocks?.length)return null;

    const cfg=S().get(core,snapshot.source||"");

    return {
      cfg,
      mempool:snapshot.summary||null,
      blocks:Array.isArray(snapshot.candidateBlocks)?snapshot.candidateBlocks:[],
      feeRecommendations:null,
      tipHeight:finite(snapshot.tipHeight),
      txids:rows.map(row=>row.txid),
      recent:rows,
      fullFeed:null,
      fullFeedSource:"",
      priceUsd:finite(snapshot.priceUsd),
      priceSource:String(snapshot.priceSource||"shared mempool visual state"),
      source:String(snapshot.source||"ZZXMempoolVisuals"),
      sharedSnapshot:snapshot,
      fetchedAt:finite(snapshot.fetchedAt)||Date.now()
    };
  }

  async function loadBase(core,base,{signal,force=false,full=null,spot=null}={}){
    const cfg=S().get(core,base);
    const ttl=force?0:5000;

    const [mempool,blocks,recommended,tip,txids,recent]=await Promise.all([
      optionalJSON(cfg.endpoints.mempool,{signal,ttlMs:ttl}),
      optionalJSON(cfg.endpoints.blocks,{signal,ttlMs:ttl}),
      optionalJSON(cfg.endpoints.recommended,{signal,ttlMs:ttl}),
      optionalText(cfg.endpoints.tipHeight,{signal,ttlMs:ttl}),
      optionalJSON(cfg.endpoints.txids,{signal,ttlMs:force?0:10000}),
      optionalJSON(cfg.endpoints.recent,{signal,ttlMs:ttl})
    ]);

    const usable=
      (mempool&&typeof mempool==="object") ||
      (Array.isArray(blocks)&&blocks.length) ||
      (Array.isArray(txids)&&txids.length) ||
      Boolean(full?.data);

    if(!usable)return null;

    return {
      cfg,
      mempool:mempool&&typeof mempool==="object"?mempool:null,
      blocks:Array.isArray(blocks)?blocks:[],
      feeRecommendations:recommended&&typeof recommended==="object"?recommended:null,
      tipHeight:finite(String(tip??"").trim()),
      txids:Array.isArray(txids)
        ? txids.map(String).filter(id=>/^[0-9a-f]{64}$/i.test(id))
        : [],
      recent:Array.isArray(recent)?recent:[],
      fullFeed:full?.data||null,
      fullFeedSource:full?.source||"",
      priceUsd:finite(spot?.value),
      priceSource:spot?.source||"",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    };
  }

  async function load(core,{signal,force=false}={}){
    const firstCfg=S().get(core);

    const [full,spot]=await Promise.all([
      fullFeed(firstCfg,signal),
      price(firstCfg.price)
    ]);

    let last=null;

    for(const base of S().apiBases(core)){
      const payload=await loadBase(
        core,
        base,
        {signal,force,full,spot}
      );

      if(payload)return payload;
      last=base;
    }

    const shared=sharedFallback(core);
    if(shared)return shared;

    throw new Error(
      `mempool data unavailable${last?` · tried ${last}`:""}`
    );
  }

  W.ZZXMempoolTilesProvider=Object.freeze({
    __version:2,
    load,
    marketPrice,
    sharedFallback
  });
})();
