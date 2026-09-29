// __partials/widgets/themarketbtccreated/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTheMarketBTCCreatedProvider?.__version>=5)return;

  async function liveHeight(){
    if(W.ZZXChain?.tipHeight){
      try{
        const out=await W.ZZXChain.tipHeight(false);
        const value=Number(out?.height);
        if(Number.isFinite(value))return value;
      }catch(_){}
    }

    return NaN;
  }

  function applyCanonicalSpot(model){
    const canonical=W.ZZXPrice?.current?.();
    const spot=Number(canonical?.price_usd??canonical?.priceUsd);
    if(!(Number.isFinite(spot)&&spot>0))return model;

    const deltaUSD=model.theoretical-spot;
    const deltaPct=spot>0?deltaUSD/spot*100:NaN;
    const totalDeltaUSD=model.adjusted-spot;
    const totalDeltaPct=spot>0?totalDeltaUSD/spot*100:NaN;

    return {
      ...model,
      spot,
      deltaUSD,
      deltaPct,
      invDeltaPct:-deltaPct,
      totalDeltaUSD,
      totalDeltaPct,
      invTotalDeltaPct:-totalDeltaPct,
      multiple:spot>0?model.adjusted/spot:NaN,
      marketSource:`${canonical?.label||"BitAvg"} · canonical site price`
    };
  }

  function refreshNetwork(model,height){
    if(!Number.isFinite(height))return model;

    const fresh=W.ZZXTheMarketBTCCreatedModel.networkFromHeight(
      height,
      model.supply
    );

    if(!fresh)return model;

    return {
      ...model,
      network:fresh,
      blockSource:model.blockSource+" + live ZZX chain tip"
    };
  }

  async function load(){
    let raw;

    try{
      raw=await W.ZZXTheMarketBTCCreatedFetch.json(
        W.ZZXTheMarketBTCCreatedSources.appraisal
      );

      W.ZZXTheMarketBTCCreatedFetch.save(raw);

      const model=applyCanonicalSpot(W.ZZXTheMarketBTCCreatedModel.normalize(raw));
      const height=await liveHeight();

      return {
        model:refreshNetwork(model,height),
        source:W.ZZXTheMarketBTCCreatedSources.appraisal,
        transport:"local-live",
        stale:false
      };
    }catch(error){
      const cached=W.ZZXTheMarketBTCCreatedFetch.load();

      if(!cached)throw error;

      const model=applyCanonicalSpot(W.ZZXTheMarketBTCCreatedModel.normalize(
        cached.value
      ));

      const height=await liveHeight();

      return {
        model:refreshNetwork(model,height),
        source:W.ZZXTheMarketBTCCreatedSources.appraisal,
        transport:"local-cache",
        stale:true,
        cacheAgeMs:Date.now()-cached.at,
        liveError:String(error?.message||error)
      };
    }
  }

  W.ZZXTheMarketBTCCreatedProvider=Object.freeze({
    __version:5,
    load,
    applyCanonicalSpot
  });
})();
