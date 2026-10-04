// __partials/widgets/fees/js/estimator.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXFeesEstimator?.__version>=4)return;

  const QUANTUM=0.125;
  const BLOCK_MINUTES=10;

  const ORDER=Object.freeze([
    "min",
    "economy",
    "low",
    "mid",
    "high",
    "fast",
    "instant"
  ]);

  const SOURCE_ORDER=Object.freeze([
    "min",
    "economy",
    "low",
    "fast",
    "instant"
  ]);

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

  function positiveOrZero(v){
    const n=finite(v);
    return Number.isFinite(n)&&n>=0?n:NaN;
  }

  function roundQuantum(value){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    return Math.round(n/QUANTUM)*QUANTUM;
  }

  function ceilQuantum(value){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    return Math.ceil((n-1e-12)/QUANTUM)*QUANTUM;
  }

  function sourceBase(rec){
    return {
      instant:positiveOrZero(rec?.fastestFee),
      fast:positiveOrZero(rec?.halfHourFee),
      low:positiveOrZero(rec?.hourFee),
      economy:positiveOrZero(rec?.economyFee),
      min:positiveOrZero(rec?.minimumFee)
    };
  }

  function finiteValues(obj){
    return Object.values(obj).filter(Number.isFinite);
  }

  function sourceBounds(raw){
    const values=finiteValues(raw);
    const minSource=Number.isFinite(raw.min)
      ? raw.min
      : values.length
        ? Math.min(...values)
        : 1;

    const maxSource=Number.isFinite(raw.instant)
      ? Math.max(raw.instant,...values)
      : values.length
        ? Math.max(...values)
        : minSource;

    return {
      min:roundQuantum(minSource),
      max:roundQuantum(maxSource)
    };
  }

  function distributedLadder(raw){
    const bounds=sourceBounds(raw);
    const gaps=ORDER.length-1;

    let min=bounds.min;
    let max=bounds.max;

    if(!Number.isFinite(min))min=1;
    if(!Number.isFinite(max))max=min;

    // Seven tiers require six positive gaps. If the source range is too
    // narrow, extend only the top edge by the smallest amount necessary.
    // Otherwise, preserve the source min/max endpoints exactly.
    let totalSteps=Math.round((max-min)/QUANTUM);

    if(totalSteps<gaps){
      totalSteps=gaps;
      max=roundQuantum(min+(totalSteps*QUANTUM));
    }

    const values=[];

    for(let index=0;index<=gaps;index++){
      const stepIndex=index===gaps
        ? totalSteps
        : Math.floor((totalSteps*index)/gaps);

      values.push(
        roundQuantum(min+(stepIndex*QUANTUM))
      );
    }

    // Integer step distribution can never duplicate when totalSteps>=gaps,
    // but keep a final safety repair.
    for(let index=1;index<values.length;index++){
      if(values[index]<=values[index-1]){
        values[index]=roundQuantum(values[index-1]+QUANTUM);
      }
    }

    return Object.fromEntries(
      ORDER.map((key,index)=>[key,values[index]])
    );
  }

  function buildRanges(tiers){
    const ranges={};

    ORDER.forEach((key,index)=>{
      ranges[key]={
        lo:index>0?tiers[ORDER[index-1]]:tiers[key],
        hi:index<ORDER.length-1?tiers[ORDER[index+1]]:tiers[key]
      };
    });

    return ranges;
  }

  function build(rec){
    const raw=sourceBase(rec);
    const tiers=distributedLadder(raw);

    // Preserve original five mempool recommendations independently from the
    // normalized display ladder so provenance is never lost.
    const rawSourceValues=SOURCE_ORDER
      .map(key=>raw[key])
      .filter(Number.isFinite);

    const meanValues=[
      tiers.instant,
      tiers.fast,
      tiers.low,
      tiers.economy,
      tiers.min
    ];

    return {
      raw,
      sourceBounds:sourceBounds(raw),
      base:{
        instant:tiers.instant,
        fast:tiers.fast,
        low:tiers.low,
        economy:tiers.economy,
        min:tiers.min
      },
      tiers,
      ranges:buildRanges(tiers),
      mean:meanValues.reduce((sum,value)=>sum+value,0)/meanValues.length,
      sourceValues:rawSourceValues.length?rawSourceValues:meanValues,
      normalizedSourceValues:meanValues,
      order:[...ORDER],
      quantumSatVB:QUANTUM
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

  function roundedRate(value){
    const n=finite(value);
    return Number.isFinite(n)?Math.ceil(n-1e-12):NaN;
  }

  function transaction(vbytes,satVB,priceUsd){
    const rawSize=finite(vbytes);
    const rate=finite(satVB);

    if(!Number.isFinite(rawSize)||rawSize<=0||!Number.isFinite(rate)||rate<0){
      return null;
    }

    const size=Math.max(1,Math.ceil(rawSize));
    const sats=Math.ceil((size*rate)-1e-12);
    const btc=sats/1e8;
    const usd=Number.isFinite(finite(priceUsd))?btc*finite(priceUsd):NaN;

    return {
      vbytes:size,
      satVB:rate,
      roundedSatVB:roundedRate(rate),
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
          rateSatVB:ceilQuantum(interpolated),
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

    const firstConfirmationTargetMinutes=Math.max(
      BLOCK_MINUTES,
      requested-depthMinutes
    );

    if(policy!=="auto"&&Number.isFinite(model.tiers[policy])){
      return {
        policy,
        rateSatVB:model.tiers[policy],
        roundedSatVB:roundedRate(model.tiers[policy]),
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
      roundedSatVB:roundedRate(interpolation.rateSatVB),
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
    __version:4,
    QUANTUM,
    BLOCK_MINUTES,
    ORDER,
    SOURCE_ORDER,
    FIRST_CONFIRMATION_MINUTES,
    build,
    convertSatVB,
    roundedRate,
    transaction,
    plan,
    interpolateRate
  });
})();
