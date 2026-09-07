(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgProvider?.__version>=5)return;

  async function live(){
    const E=W.ZZXBitAvgConstants.endpoints;

    const [markets,latest,exchangeConfig,currencies,exchangeRates]=await Promise.all([
      W.ZZXBitAvgFetch.json(E.markets,{optional:true}),
      W.ZZXBitAvgFetch.json(E.latest),
      W.ZZXBitAvgFetch.json(E.exchanges,{optional:true}),
      W.ZZXBitAvgFetch.json(E.currencies,{optional:true}),
      W.ZZXBitAvgFetch.json(E.rates,{optional:true})
    ]);

    const bundle={markets,latest,exchangeConfig,currencies,exchangeRates};
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

  W.ZZXBitAvgProvider=Object.freeze({__version:5,load});
})();
