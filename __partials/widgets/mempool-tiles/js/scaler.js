// Metric scaling for square-atlas area and bivariate transaction color.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesScaler?.__version>=4)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function quantile(sorted,q){
    if(!sorted.length)return NaN;
    const p=clamp(Number(q)||0,0,1)*(sorted.length-1);
    const low=Math.floor(p);
    const high=Math.ceil(p);
    if(low===high)return sorted[low];
    return sorted[low]+(sorted[high]-sorted[low])*(p-low);
  }

  function metricValue(tx,mode){
    if(mode==="value")return Number(tx?.valueSats);
    if(mode==="fee")return Number(tx?.feeSats);
    if(mode==="feerate")return Number(tx?.packageFeeRate??tx?.feeRate);
    return Number(tx?.vsize);
  }

  function makeScale(items,mode="value"){
    const values=(Array.isArray(items)?items:[])
      .map(tx=>metricValue(tx,mode))
      .filter(value=>Number.isFinite(value)&&value>=0)
      .sort((a,b)=>a-b);

    const median=values.length?quantile(values,.5):1;
    const low=values.length?quantile(values,.005):0;
    const high=values.length?Math.max(low+1e-9,quantile(values,.9995)):1;
    const p99=values.length?Math.max(low+1e-9,quantile(values,.99)):1;
    const cap=Math.max(high,p99*3,median*12,1e-9);
    const floor=Math.max(cap*1e-7,median*1e-4,1e-12);

    return {
      mode,
      low,
      high,
      p99,
      cap,
      floor,
      median,
      known:values.length,
      total:values.reduce((sum,value)=>sum+value,0)
    };
  }

  function weight(tx,scale){
    const value=metricValue(tx,scale.mode);
    if(!Number.isFinite(value)||value<0)return Math.max(scale.floor,scale.median*.08);

    const clipped=clamp(value,0,scale.cap);

    // Square area tracks the metric directly; the soft floor keeps dust visible.
    return Math.max(scale.floor,clipped);
  }

  function normalized(tx,scale){
    const value=metricValue(tx,scale.mode);
    if(!Number.isFinite(value)||value<=scale.low)return 0;
    if(value>=scale.cap)return 1;

    const start=Math.log1p(Math.max(0,scale.low));
    const end=Math.log1p(Math.max(scale.low+1e-12,scale.cap));
    return clamp((Math.log1p(value)-start)/Math.max(1e-12,end-start),0,1);
  }

  function distribution(items,mode){
    const scale=makeScale(items,mode);
    return (Array.isArray(items)?items:[]).map(tx=>({
      tx,
      metric:metricValue(tx,mode),
      normalized:normalized(tx,scale),
      weight:weight(tx,scale)
    }));
  }

  W.ZZXMempoolTilesScaler=Object.freeze({
    __version:4,
    quantile,
    metricValue,
    makeScale,
    weight,
    normalized,
    distribution
  });
})();
