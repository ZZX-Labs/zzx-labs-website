(function(){
  "use strict";

  const W=window;
  if(W.ZZXBitAvgPublisher?.__version>=10)return;

  const CHANNEL="zzx:bpi:update";
  const PROVIDER_ID="bitavg";
  const MODE_ID="global-bpi";

  function snapshot(model,transport,stale){
    const globalPrice=Number(model.globalBpi);
    const nativePrice=Number(model.bpi);

    return Object.freeze({
      provider:PROVIDER_ID,
      mode:MODE_ID,
      label:"BitAvg BPI weighting state",
      price_usd:globalPrice,
      global_price_usd:globalPrice,
      bpi_price_usd:nativePrice,
      weighted_price_usd:Number(model.weightedBpi),
      unweighted_price_usd:Number(model.unweightedBpi),
      bpi_weighted_price_usd:Number(model.canonicalBpiWeighted),
      bpi_unweighted_price_usd:Number(model.canonicalBpiUnweighted),
      weighting_mode:String(model.weightingMode||"off"),
      weighting_target:
        model.weightingMode==="off"
          ? null
          : String(model.weightingMode),
      weights_enabled:!!model.weightsEnabled,
      global_weights_enabled:!!model.globalWeightsEnabled,
      bpi_weights_enabled:!!model.bpiWeightsEnabled,
      method:
        model.globalWeightsEnabled
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
      weight_basis:
        "eligible market 24h BTC volume / eligible global 24h BTC volume",
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

    // Read-only publication points for widgets/core.
    W.ZZXGlobalBPI=Object.freeze({
      ...value,
      mode:"global-bpi",
      label:"Global BPI",
      price_usd:Number(model.globalBpi)
    });
    W.ZZXNativeBPI=Object.freeze({
      ...value,
      mode:"bpi",
      label:"BPI",
      price_usd:Number(model.bpi)
    });

    // If a shared BPI registry exists later, publish without taking ownership
    // of the selected mode. The Bitcoin Ticker remains the sole selector.
    try{
      W.ZZXBPIRegistry?.publish?.(PROVIDER_ID,value);
    }catch(_){}

    try{
      W.dispatchEvent(new CustomEvent(CHANNEL,{detail:value}));
    }catch(_){}

    return value;
  }

  W.ZZXBitAvgPublisher=Object.freeze({
    __version:10,
    channel:CHANNEL,
    providerId:PROVIDER_ID,
    modeId:MODE_ID,
    publish
  });
})();
