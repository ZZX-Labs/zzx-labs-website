(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicProvider?.__version>=6)return;

  const F=()=>W.ZZXMempoolMosaicFetch;
  const S=()=>W.ZZXMempoolMosaicSources;
  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};
  const optionalJSON=async(url,opts)=>{try{return await F().fetchJSON(url,opts)}catch(_){return null}};
  const optionalText=async(url,opts)=>{try{return await F().fetchText(url,opts)}catch(_){return null}};

  function marketPrice(){
    const state=W.ZZXMarketState;let snap=null;
    try{snap=typeof state?.getSnapshot==="function"?state.getSnapshot():(state?.snapshot||state?.current||state)}catch(_){snap=state}
    for(const value of [snap?.effectivePriceUsd,snap?.effective_price_usd,state?.effectivePriceUsd,state?.effective_price_usd]){
      const n=finite(value);if(n>0)return {value:n,source:"ZZX Market State"};
    }
    return null;
  }

  function sharedFallback(core){
    let view=null;
    try{view=W.ZZXMempoolLive?.current?.()||W.ZZXMempoolLiveLatest||null}catch(_){view=W.ZZXMempoolLiveLatest||null}
    const snapshot=view?.snapshot||view;
    if(!snapshot)return null;
    const rows=Array.isArray(snapshot.transactions)?snapshot.transactions:[];
    if(!rows.length&&!snapshot.mempool&&!snapshot.blocks?.length)return null;
    const cfg=S().get(core,snapshot.base||"");
    const spot=marketPrice();
    return {
      cfg,
      mempool:snapshot.mempool||null,
      blocks:Array.isArray(snapshot.blocks)?snapshot.blocks:[],
      fullFeed:rows.length?rows:null,
      fullFeedSource:rows.length?"ZZXMempoolLive":"",
      tipHeight:finite(snapshot.tipHeight),
      priceUsd:finite(snapshot.priceUsd??spot?.value),
      priceSource:String(snapshot.priceSource||spot?.source||""),
      source:String(view?.source||snapshot.base||"ZZXMempoolLive"),
      fetchedAt:finite(snapshot.fetchedAt??view?.fetchedAt)||Date.now()
    };
  }

  async function loadBase(core,base,{signal,force=false}={}){
    const cfg=S().get(core,base),ttl=force?0:5000;
    // Only data consumed by the current Mosaic model is fetched here.
    const [mempool,blocks,tip]=await Promise.all([
      optionalJSON(cfg.endpoints.mempool,{signal,ttlMs:ttl}),
      optionalJSON(cfg.endpoints.blocks,{signal,ttlMs:ttl}),
      optionalText(cfg.endpoints.tipHeight,{signal,ttlMs:ttl})
    ]);
    const usable=(mempool&&typeof mempool==="object")||(Array.isArray(blocks)&&blocks.length);
    if(!usable)return null;
    const spot=marketPrice();
    return {
      cfg,
      mempool:mempool&&typeof mempool==="object"?mempool:null,
      blocks:Array.isArray(blocks)?blocks:[],
      fullFeed:null,
      fullFeedSource:"",
      tipHeight:finite(String(tip??"").trim()),
      priceUsd:finite(spot?.value),
      priceSource:spot?.source||"",
      source:cfg.apiBase,
      fetchedAt:Date.now()
    };
  }

  async function load(core,{signal,force=false}={}){
    // Reuse an already-running shared mempool service when available. This is
    // zero additional network work and gives Mosaic a transaction fallback.
    const shared=sharedFallback(core);
    if(shared?.fullFeed?.length)return Object.freeze(shared);

    let last="";
    for(const base of S().apiBases(core)){
      last=base;
      const payload=await loadBase(core,base,{signal,force});
      if(payload)return Object.freeze(payload);
    }
    if(shared)return Object.freeze(shared);
    throw new Error(`mempool REST data unavailable${last?` · tried ${last}`:""}`);
  }

  W.ZZXMempoolMosaicProvider=Object.freeze({__version:6,load,marketPrice,sharedFallback});
})();
