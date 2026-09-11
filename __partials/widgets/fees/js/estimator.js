// __partials/widgets/fees/js/estimator.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXFeesEstimator?.__version>=3)return;

  const STEP=0.01;
  const BLOCK_MINUTES=10;

  // Ordered from cheapest/slowest to most expensive/fastest.
  const ORDER=Object.freeze([
    "min",
    "economy",
    "low",
    "mid",
    "high",
    "fast",
    "instant"
  ]);

  // First-confirmation planning anchors. These are planning bands, not
  // guarantees; block production and mempool state remain stochastic.
  const FIRST_CONFIRMATION_MINUTES=Object.freeze({
    instant:10,
    fast:30,
    high:40,
    mid:50,
    low:60,
    economy:180,
    min:1440
  });

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function ceilTo(value,step=STEP){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    return Math.ceil((n-1e-12)/step)*step;
  }

  function roundTo(value,step=STEP){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    return Math.round(n/step)*step;
  }

  function validPositive(value){
    const n=finite(value);
    return Number.isFinite(n)&&n>=0?n:NaN;
  }

  function sourceBase(rec){
    return {
      instant:validPositive(rec?.fastestFee),
      fast:validPositive(rec?.halfHourFee),
      low:validPositive(rec?.hourFee),
      economy:validPositive(rec?.economyFee),
      min:validPositive(rec?.minimumFee)
    };
  }

  function firstFinite(...values){
    for(const value of values){
      if(Number.isFinite(value))return value;
    }
    return NaN;
  }

  function normalizedBase(raw){
    // Preserve the source values as the floor for each corresponding tier,
    // but make the presentation ladder strictly monotonic. Fast reserves
    // two sub-sat slots for the derived Mid/High tiers.
    const min=ceilTo(firstFinite(raw.min,raw.economy,raw.low,raw.fast,raw.instant,1));
    const economy=ceilTo(Math.max(
      firstFinite(raw.economy,min),
      min+STEP
    ));
    const low=ceilTo(Math.max(
      firstFinite(raw.low,economy),
      economy+STEP
    ));
    const fast=ceilTo(Math.max(
      firstFinite(raw.fast,low),
      low+(STEP*3)
    ));
    const instant=ceilTo(Math.max(
      firstFinite(raw.instant,fast),
      fast+STEP
    ));

    return {instant,fast,low,economy,min};
  }

  function derivedTiers(base){
    const gap=base.fast-base.low;

    let mid=roundTo(base.low+(gap/3));
    let high=roundTo(base.low+(gap*2/3));

    // Rounding can collapse boundaries in tiny source gaps. Repair using
    // 0.01 sat/vB increments while never exceeding the source-derived fast.
    mid=Math.max(mid,roundTo(base.low+STEP));
    high=Math.max(high,roundTo(mid+STEP));

    if(high>=base.fast){
      high=roundTo(base.fast-STEP);
    }
    if(mid>=high){
      mid=roundTo(high-STEP);
    }

    return {
      instant:base.instant,
      fast:base.fast,
      high,
      mid,
      low:base.low,
      economy:base.economy,
      min:base.min
    };
  }

  function strictRepair(tiers){
    const out={...tiers};
    let previous=NaN;

    for(const key of ORDER){
      let value=ceilTo(out[key]);

      if(!Number.isFinite(value)){
        value=Number.isFinite(previous)?ceilTo(previous+STEP):STEP;
      }

      if(Number.isFinite(previous)&&value<=previous){
        value=ceilTo(previous+STEP);
      }

      out[key]=value;
      previous=value;
    }

    return out;
  }

  function buildRanges(tiers){
    const ranges={};

    ORDER.forEach((key,index)=>{
      const value=tiers[key];
      const lower=index>0?tiers[ORDER[index-1]]:value;
      const upper=index<ORDER.length-1?tiers[ORDER[index+1]]:value;
      ranges[key]={lo:lower,hi:upper};
    });

    return ranges;
  }

  function build(rec){
    const raw=sourceBase(rec);
    const base=normalizedBase(raw);
    const tiers=strictRepair(derivedTiers(base));

    // Five source-corresponding normalized levels are used once each.
    const sourceValues=[
      tiers.instant,
      tiers.fast,
      tiers.low,
      tiers.economy,
      tiers.min
    ];

    const mean=sourceValues.reduce((a,b)=>a+b,0)/sourceValues.length;

    return {
      raw,
      base:{
        instant:tiers.instant,
        fast:tiers.fast,
        low:tiers.low,
        economy:tiers.economy,
        min:tiers.min
      },
      tiers,
      ranges:buildRanges(tiers),
      mean,
      sourceValues,
      order:[...ORDER],
      stepSatVB:STEP
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
    const rawSize=finite(vbytes);
    const rate=finite(satVB);

    if(!Number.isFinite(rawSize)||rawSize<=0||!Number.isFinite(rate)||rate<0){
      return null;
    }

    const size=Math.max(1,Math.ceil(rawSize));
    // Fee rate can be sub-sat/vB, but the transaction fee is integer sats.
    // Always round upward so the effective paid rate never undershoots.
    const sats=Math.ceil((size*rate)-1e-12);
    const btc=sats/1e8;
    const usd=Number.isFinite(finite(priceUsd))?btc*finite(priceUsd):NaN;

    return {
      vbytes:size,
      satVB:rate,
      sats,
      btc,
      usd,
      effectiveSatVB:sats/size
    };
  }

  function interpolateRate(tiers,targetMinutes){
    const target=Math.max(BLOCK_MINUTES,finite(targetMinutes));

    const points=[
      ["instant",FIRST_CONFIRMATION_MINUTES.instant],
      ["fast",FIRST_CONFIRMATION_MINUTES.fast],
      ["high",FIRST_CONFIRMATION_MINUTES.high],
      ["mid",FIRST_CONFIRMATION_MINUTES.mid],
      ["low",FIRST_CONFIRMATION_MINUTES.low],
      ["economy",FIRST_CONFIRMATION_MINUTES.economy],
      ["min",FIRST_CONFIRMATION_MINUTES.min]
    ];

    if(target<=points[0][1]){
      return {
        rateSatVB:tiers[points[0][0]],
        lowerKey:points[0][0],
        upperKey:points[0][0]
      };
    }

    for(let i=1;i<points.length;i++){
      const [slowKey,slowMinutes]=points[i];
      const [fastKey,fastMinutes]=points[i-1];

      if(target<=slowMinutes){
        const fastRate=tiers[fastKey];
        const slowRate=tiers[slowKey];
        const fraction=(target-fastMinutes)/(slowMinutes-fastMinutes);
        const interpolated=fastRate+((slowRate-fastRate)*fraction);

        return {
          rateSatVB:ceilTo(interpolated),
          lowerKey:slowKey,
          upperKey:fastKey
        };
      }
    }

    return {
      rateSatVB:tiers.min,
      lowerKey:"min",
      upperKey:"min"
    };
  }

  function plan(model,totalMinutes,confirmations,policy="auto"){
    if(!model?.tiers)return null;

    const requested=Math.max(
      BLOCK_MINUTES,
      Math.round(finite(totalMinutes)||30)
    );

    const conf=Math.min(
      144,
      Math.max(1,Math.round(finite(confirmations)||1))
    );

    const minimumPracticalMinutes=conf*BLOCK_MINUTES;
    const depthMinutes=Math.max(0,(conf-1)*BLOCK_MINUTES);
    const constrained=requested<minimumPracticalMinutes;

    // User supplies a desired total time to the requested confirmation depth.
    // Reserve ~10 min for every confirmation after the first, and use the
    // remaining budget to choose the first-inclusion fee rate.
    const firstConfirmationTargetMinutes=Math.max(
      BLOCK_MINUTES,
      requested-depthMinutes
    );

    if(policy!=="auto"&&Number.isFinite(model.tiers[policy])){
      return {
        policy,
        rateSatVB:model.tiers[policy],
        bandLabel:policy,
        confirmations:conf,
        requestedTotalMinutes:requested,
        minimumPracticalMinutes,
        depthMinutes,
        firstConfirmationTargetMinutes,
        constrained
      };
    }

    const interpolation=interpolateRate(
      model.tiers,
      firstConfirmationTargetMinutes
    );

    const bandLabel=interpolation.lowerKey===interpolation.upperKey
      ? interpolation.upperKey
      : `${interpolation.upperKey}→${interpolation.lowerKey}`;

    return {
      policy:"auto",
      rateSatVB:interpolation.rateSatVB,
      bandLabel,
      confirmations:conf,
      requestedTotalMinutes:requested,
      minimumPracticalMinutes,
      depthMinutes,
      firstConfirmationTargetMinutes,
      constrained,
      upperKey:interpolation.upperKey,
      lowerKey:interpolation.lowerKey
    };
  }

  W.ZZXFeesEstimator=Object.freeze({
    __version:3,
    STEP,
    BLOCK_MINUTES,
    ORDER,
    FIRST_CONFIRMATION_MINUTES,
    build,
    convertSatVB,
    transaction,
    plan,
    interpolateRate
  });
})();
