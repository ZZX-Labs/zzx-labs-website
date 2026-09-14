// __partials/widgets/mempool-tiles/js/scaler.js
// v2 — robust per-slot square footprint scaling
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesScaler?.__version>=2)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function quantile(sorted,q){
    if(!sorted.length)return NaN;

    const p=clamp(Number(q)||0,0,1)*(sorted.length-1);
    const lo=Math.floor(p);
    const hi=Math.ceil(p);

    if(lo===hi)return sorted[lo];

    const t=p-lo;
    return sorted[lo]+(sorted[hi]-sorted[lo])*t;
  }

  function metricValue(tx,mode){
    if(mode==="value")return Number(tx?.valueSats);
    if(mode==="feerate")return Number(tx?.packageFeeRate??tx?.feeRate);
    return Number(tx?.vsize);
  }

  function makeScale(items,mode="vsize"){
    const values=(Array.isArray(items)?items:[])
      .map(tx=>metricValue(tx,mode))
      .filter(value=>Number.isFinite(value)&&value>=0)
      .sort((a,b)=>a-b);

    let lowQ=.02;
    let highQ=.995;
    let curve=.84;

    if(mode==="value"){
      lowQ=.01;
      highQ=.995;
      curve=.68;
    }else if(mode==="feerate"){
      lowQ=.02;
      highQ=.99;
      curve=.76;
    }

    const low=values.length
      ? Math.max(0,quantile(values,lowQ))
      : 0;

    const high=values.length
      ? Math.max(low+1e-9,quantile(values,highQ))
      : 1;

    /*
     * Tile area, not side length, carries the selected metric. The square is
     * drawn inside one stable transaction slot. This keeps all candidate TXs
     * legible and prevents the packer pathologies that made earlier versions
     * look like strips/confetti while still preserving monotonic visual scale.
     */
    return {
      mode,
      low,
      high,
      logLow:Math.log1p(low),
      logHigh:Math.log1p(high),
      curve,
      minAreaFraction:.055,
      maxAreaFraction:.79,
      known:values.length
    };
  }

  function normalized(tx,scale){
    const value=metricValue(tx,scale.mode);

    if(!Number.isFinite(value))return 0;
    if(value<=scale.low)return 0;
    if(value>=scale.high)return 1;

    const span=Math.max(1e-12,scale.logHigh-scale.logLow);

    return clamp(
      (
        Math.log1p(Math.max(0,value))-
        scale.logLow
      )/span,
      0,
      1
    );
  }

  function areaFraction(tx,scale){
    const t=normalized(tx,scale);

    return (
      scale.minAreaFraction+
      (
        scale.maxAreaFraction-
        scale.minAreaFraction
      )*
      Math.pow(t,scale.curve)
    );
  }

  function ratio(tx,scale){
    return Math.sqrt(
      clamp(
        areaFraction(tx,scale),
        .01,
        .94
      )
    );
  }

  /* Compatibility helper for callers from the experimental packer versions. */
  function side(tx,scale){
    return ratio(tx,scale);
  }

  W.ZZXMempoolTilesScaler=Object.freeze({
    __version:2,
    quantile,
    metricValue,
    makeScale,
    normalized,
    areaFraction,
    ratio,
    side
  });
})();
