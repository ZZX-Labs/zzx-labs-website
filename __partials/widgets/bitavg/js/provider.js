(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgProvider?.__version>=9)return;


  async function browserLive(){
    try{await W.ZZXLiveBPI?.start?.();}catch(_){}
    const snap=W.ZZXLiveBPI?.snapshot?.();
    const stamp=snap?.observed_at??snap?.updated_at;
    const age=stamp?Date.now()-new Date(stamp).getTime():Infinity;
    if(!snap||!Number.isFinite(age)||age>15_000)return null;

    const E=W.ZZXBitAvgConstants.endpoints;
    const [exchangeConfig,currencies,exchangeRates,indexPolicy]=await Promise.all([
      W.ZZXBitAvgFetch.json(E.exchanges,{optional:true}),
      W.ZZXBitAvgFetch.json(E.currencies,{optional:true}),
      W.ZZXBitAvgFetch.json(E.rates,{optional:true}),
      W.ZZXBitAvgFetch.json(E.indexPolicy,{optional:true})
    ]);
    const rows=W.ZZXLiveBPI?.markets?.()||[];
    if(rows.length<2)return null;
    const bundle={
      markets:{schema:"zzx-bpi-browser-live-markets-v3",updated_at:snap.observed_at??snap.updated_at,observed_at:snap.observed_at??snap.updated_at,source_updated_at:snap.source_updated_at??snap.updated_at,markets:rows},
      latest:snap,exchangeConfig,currencies,exchangeRates,indexPolicy
    };
    const model=W.ZZXBitAvgModel.build(bundle);
    W.ZZXBitAvgFetch.save(bundle);
    return {model,transport:"browser-live-2.5s",stale:false};
  }

  async function live(){
    const E=W.ZZXBitAvgConstants.endpoints;

    const [markets,latest,exchangeConfig,currencies,exchangeRates,indexPolicy]=await Promise.all([
      W.ZZXBitAvgFetch.json(E.markets,{optional:true}),
      W.ZZXBitAvgFetch.json(E.latest),
      W.ZZXBitAvgFetch.json(E.exchanges,{optional:true}),
      W.ZZXBitAvgFetch.json(E.currencies,{optional:true}),
      W.ZZXBitAvgFetch.json(E.rates,{optional:true}),
      W.ZZXBitAvgFetch.json(E.indexPolicy,{optional:true})
    ]);

    const observedAt=new Date().toISOString();
    const observedLatest={
      ...latest,
      source_updated_at:latest?.source_updated_at||latest?.updated_at||null,
      observed_at:observedAt
    };
    const observedMarkets={
      ...markets,
      source_updated_at:markets?.source_updated_at||markets?.updated_at||null,
      observed_at:observedAt
    };
    const bundle={markets:observedMarkets,latest:observedLatest,exchangeConfig,currencies,exchangeRates,indexPolicy};
    const model=W.ZZXBitAvgModel.build(bundle);

    W.ZZXBitAvgFetch.save(bundle);

    return {
      model,
      transport:"local-live",
      stale:false
    };
  }

  async function load(){
    try{
      const realtime=await browserLive();
      if(realtime)return realtime;
      return await live();
    }catch(error){
      const cached=W.ZZXBitAvgFetch.load();
      if(!cached)throw error;

      return {
        model:W.ZZXBitAvgModel.build(cached.value),
        transport:"local-cache",
        stale:true,
        cacheAgeMs:cached.ageMs,
        liveError:String(error?.message||error)
      };
    }
  }

  W.ZZXBitAvgProvider=Object.freeze({__version:9,load});
})();
