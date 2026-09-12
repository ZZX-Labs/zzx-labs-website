// __partials/widgets/mempool-tiles/js/scaler.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesScaler?.__version>=1)return;

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

  function maxSideForCount(count){
    const n=Math.max(1,Number(count)||1);
    if(n>=6000)return 6;
    if(n>=4000)return 7;
    if(n>=2500)return 8;
    if(n>=1500)return 9;
    if(n>=800)return 10;
    return 12;
  }

  function makeScale(items,mode="vsize"){
    const values=items
      .map(tx=>metricValue(tx,mode))
      .filter(v=>Number.isFinite(v)&&v>=0)
      .sort((a,b)=>a-b);

    const minSide=1;
    const maxSide=maxSideForCount(items.length);

    let lowQ=.02;
    let highQ=.995;
    let curve=.78;

    if(mode==="vsize"){
      lowQ=.01;
      highQ=.995;
      curve=.88;
    }else if(mode==="feerate"){
      lowQ=.02;
      highQ=.99;
      curve=.8;
    }

    const low=values.length?Math.max(0,quantile(values,lowQ)):0;
    const high=values.length?Math.max(low+1,quantile(values,highQ)):1;

    return {
      mode,
      minSide,
      maxSide,
      low,
      high,
      logLow:Math.log1p(low),
      logHigh:Math.log1p(high),
      curve,
      known:values.length
    };
  }

  function side(tx,scale){
    const value=metricValue(tx,scale.mode);

    if(!Number.isFinite(value)||value<=scale.low){
      return scale.minSide;
    }

    if(value>=scale.high){
      return scale.maxSide;
    }

    const t=clamp(
      (Math.log1p(Math.max(0,value))-scale.logLow) /
      Math.max(1e-9,scale.logHigh-scale.logLow),
      0,
      1
    );

    return clamp(
      scale.minSide +
      Math.round(
        Math.pow(t,scale.curve) *
        (scale.maxSide-scale.minSide)
      ),
      scale.minSide,
      scale.maxSide
    );
  }

  W.ZZXMempoolTilesScaler=Object.freeze({
    __version:1,
    quantile,
    metricValue,
    maxSideForCount,
    makeScale,
    side
  });
})();
