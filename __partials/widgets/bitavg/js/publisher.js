(function(){
  "use strict";

  const W=window;
  if(W.ZZXBitAvgPublisher?.__version>=5)return;

  const CHANNEL="zzx:bpi:update";
  const PROVIDER_ID="bitavg";
  const MODE_ID="global-bpi";

  function snapshot(model,transport,stale){
    return Object.freeze({
      provider:PROVIDER_ID,
      mode:MODE_ID,
      label:"Global BPI",
      price_usd:Number(model.bpi),
      method:model.method,
      exchange_count:model.exchanges.length,
      market_count:model.markets,
      fiat_count:model.currencies.length,
      volume_24h_btc:Number(model.volume),
      weight_sum:Number(model.weightSum),
      updated_at:model.updatedAt||new Date().toISOString(),
      rendered_at:Date.now(),
      transport:String(transport||""),
      stale:!!stale
    });
  }

  function publish(model,transport,stale){
    const value=snapshot(model,transport,stale);

    // Read-only publication point for widgets/core.
    W.ZZXGlobalBPI=value;

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
    __version:5,
    channel:CHANNEL,
    providerId:PROVIDER_ID,
    modeId:MODE_ID,
    publish
  });
})();
