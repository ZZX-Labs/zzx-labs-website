// __partials/widgets/fees/js/estimator.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXFeesEstimator?.__version>=2)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function range(values,value){
    const src=[...new Set(values.filter(Number.isFinite))].sort((a,b)=>a-b);
    if(!src.length||!Number.isFinite(value))return {lo:NaN,hi:NaN};

    let idx=src.findIndex(x=>x>=value);
    if(idx<0)idx=src.length-1;

    return {
      lo:src[Math.max(0,idx-1)] ?? value,
      hi:src[Math.min(src.length-1,idx+1)] ?? value
    };
  }

  function build(rec){
    const base={
      instant:finite(rec?.fastestFee),
      fast:finite(rec?.halfHourFee),
      low:finite(rec?.hourFee),
      economy:finite(rec?.economyFee),
      min:finite(rec?.minimumFee)
    };

    // UI convenience tiers. High/Mid are labels derived from distinct source
    // values; they do not get counted again in the headline mean.
    const tiers={
      instant:base.instant,
      fast:base.fast,
      high:base.instant,
      mid:base.fast,
      low:base.low,
      economy:base.economy,
      min:base.min
    };

    const distinct=[
      base.instant,
      base.fast,
      base.low,
      base.economy,
      base.min
    ].filter(Number.isFinite);

    const mean=distinct.length
      ? distinct.reduce((a,b)=>a+b,0)/distinct.length
      : NaN;

    const ranges={};
    for(const [key,value] of Object.entries(tiers)){
      ranges[key]=range(distinct,value);
    }

    return {
      base,
      tiers,
      ranges,
      mean,
      sourceValues:distinct
    };
  }

  function convertSatVB(value,unit){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;

    if(unit==="btc")return n/1e8;
    if(unit==="msat")return n*1000;
    if(unit==="usat")return n*1e6;
    return n;
  }

  function transaction(vbytes,satVB,priceUsd){
    const size=Math.max(1,Math.round(finite(vbytes)));
    const rate=finite(satVB);
    if(!Number.isFinite(size)||!Number.isFinite(rate))return null;

    const sats=Math.ceil(size*rate);
    const btc=sats/1e8;
    const usd=Number.isFinite(finite(priceUsd))?btc*finite(priceUsd):NaN;

    return {vbytes:size,satVB:rate,sats,btc,usd};
  }

  W.ZZXFeesEstimator=Object.freeze({
    __version:2,
    build,
    convertSatVB,
    transaction
  });
})();
