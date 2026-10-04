(function(){
  "use strict";

  const W=window;
  if(W.ZZXBitAvgPublisher?.__version>=12)return;

  const CHANNEL="zzx:bpi:update";
  const PROVIDER_ID="bitavg";
  const MODE_ID="global-bpi";

  function activeQuote(model,transport,stale){
    const mode=String(model.weightingMode||"off");
    const raw=Number(model.unweightedBpi);
    const bpi=Number(model.canonicalBpiWeighted);
    const globalBpi=Number(model.weightedBpi);
    const price=mode==="bpi"?bpi:mode==="global-bpi"?globalBpi:raw;
    const label=mode==="bpi"?"BPI Weighted":mode==="global-bpi"?"Global BPI Weighted":"Unweighted";

    return Object.freeze({
      provider:PROVIDER_ID,
      mode,
      label,
      price_usd:price,
      priceUsd:price,
      raw_price_usd:raw,
      unweighted_price_usd:raw,
      bpi_weighted_price_usd:bpi,
      global_bpi_weighted_price_usd:globalBpi,
      observed_at:model.updatedAt||new Date().toISOString(),
      source_updated_at:model.sourceUpdatedAt||null,
      transport:String(transport||""),
      stale:!!stale,
      authoritative:true,
      region:"US"
    });
  }

  function snapshot(model,transport,stale){
    const active=activeQuote(model,transport,stale);
    const globalPrice=Number(model.globalBpi);
    const nativePrice=Number(model.bpi);

    return Object.freeze({
      provider:PROVIDER_ID,
      mode:MODE_ID,
      label:"BitAvg BPI weighting state",
      price_usd:active.price_usd,
      active_label:active.label,
      active_mode:active.mode,
      global_price_usd:globalPrice,
      bpi_price_usd:nativePrice,
      weighted_price_usd:Number(model.weightedBpi),
      unweighted_price_usd:Number(model.unweightedBpi),
      bpi_weighted_price_usd:Number(model.canonicalBpiWeighted),
      bpi_unweighted_price_usd:Number(model.canonicalBpiUnweighted),
      global_bpi_weighted_price_usd:Number(model.weightedBpi),
      weighting_mode:String(model.weightingMode||"off"),
      weighting_target:model.weightingMode==="off"?null:String(model.weightingMode),
      weights_enabled:!!model.weightsEnabled,
      global_weights_enabled:!!model.globalWeightsEnabled,
      bpi_weights_enabled:!!model.bpiWeightsEnabled,
      method:
        model.bpiWeightsEnabled
          ? (model.methodCanonicalWeighted||"canonical_bpi_24h_btc_volume_weighted")
          : model.globalWeightsEnabled
            ? model.methodWeighted
            : model.methodUnweighted,
      method_weighted:model.methodWeighted,
      method_unweighted:model.methodUnweighted,
      exchange_count:model.exchanges.length,
      market_count:model.markets,
      observed_market_count:model.observedMarkets,
      quarantined_market_count:model.quarantinedMarkets,
      fiat_count:model.currencies.length,
      volume_24h_btc:Number(model.volume),
      weight_sum:Number(model.weightSum),
      weight_basis:"eligible market 24h BTC volume / eligible global 24h BTC volume",
      updated_at:model.updatedAt||new Date().toISOString(),
      observed_at:model.updatedAt||new Date().toISOString(),
      source_updated_at:model.sourceUpdatedAt||null,
      rendered_at:Date.now(),
      transport:String(transport||""),
      stale:!!stale
    });
  }

  function publish(model,transport,stale){
    const value=snapshot(model,transport,stale);
    const active=activeQuote(model,transport,stale);

    // Semantic index publications remain index-specific.  The active quote is
    // published separately through ZZXPrice / ZZXCanonicalBitcoinPrice.
    W.ZZXGlobalBPI=Object.freeze({
      ...value,
      mode:"global-bpi",
      label:"Global BPI",
      price_usd:Number(model.globalBpi),
      weighted_price_usd:Number(model.weightedBpi),
      unweighted_price_usd:Number(model.unweightedBpi)
    });
    W.ZZXNativeBPI=Object.freeze({
      ...value,
      mode:"bpi",
      label:"BPI",
      price_usd:Number(model.bpi),
      weighted_price_usd:Number(model.canonicalBpiWeighted),
      unweighted_price_usd:Number(model.canonicalBpiUnweighted)
    });

    if(W.ZZXPrice?.setPriceSet){
      W.ZZXPrice.setPriceSet(active);
    }else{
      W.ZZXCanonicalBitcoinPrice=active;
      W.ZZXBitAvgPrice=active;
      W.ZZXSelectedPriceUsd=Number(active.price_usd);
      try{W.dispatchEvent(new CustomEvent("zzx:canonical-bitcoin-price",{detail:active}))}catch(_){}
      try{W.dispatchEvent(new CustomEvent("zzx:bitavg-price",{detail:active}))}catch(_){}
    }

    try{W.ZZXBPIRegistry?.publish?.(PROVIDER_ID,value)}catch(_){}
    try{W.dispatchEvent(new CustomEvent(CHANNEL,{detail:value}))}catch(_){}

    return value;
  }

  W.ZZXBitAvgPublisher=Object.freeze({
    __version:12,
    channel:CHANNEL,
    providerId:PROVIDER_ID,
    modeId:MODE_ID,
    publish
  });
})();
