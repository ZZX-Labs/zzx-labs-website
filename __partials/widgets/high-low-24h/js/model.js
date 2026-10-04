(function(){
  "use strict";

  const W=window;
  if(W.ZZXHighLow24HModel?.__version>=4)return;

  const DAY_MS=24*60*60*1000;
  const LIVE_BUCKET_MS=15_000;
  const MODES=new Set(["off","bpi","global-bpi"]);

  const finite=value=>{
    if(value==null||value==="")return NaN;
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  };

  const positive=value=>{
    const number=finite(value);
    return number>0?number:NaN;
  };

  function timestamp(point){
    const raw=point?.t??point?.ts_ms??point?.timestamp??point?.updated_at;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const parsed=new Date(raw).getTime();
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function normalize(points,{now=Date.now(),trim=true}={}){
    const cutoff=now-DAY_MS;
    const byTime=new Map();

    for(const raw of Array.isArray(points)?points:[]){
      if(!raw||typeof raw!=="object")continue;

      const t=timestamp(raw);
      if(!Number.isFinite(t))continue;
      if(trim&&t<cutoff-60_000)continue;

      const close=positive(raw.close??raw.price??raw.price_usd??raw.bpi_usd);
      if(!Number.isFinite(close))continue;

      const open=positive(raw.open);
      const high=positive(raw.high);
      const low=positive(raw.low);

      const normalizedOpen=Number.isFinite(open)?open:close;
      const normalizedHigh=Number.isFinite(high)?Math.max(high,normalizedOpen,close):Math.max(normalizedOpen,close);
      const normalizedLow=Number.isFinite(low)?Math.min(low,normalizedOpen,close):Math.min(normalizedOpen,close);

      byTime.set(t,{
        ...raw,
        t,
        open:normalizedOpen,
        high:normalizedHigh,
        low:normalizedLow,
        close,
        price:close,
        bucket_high_usd:normalizedHigh,
        bucket_low_usd:normalizedLow
      });
    }

    return [...byTime.values()].sort((a,b)=>a.t-b.t);
  }

  function quoteMode(quote){
    const mode=String(quote?.mode??W.ZZXPrice?.mode?.()??"off");
    return MODES.has(mode)?mode:"off";
  }

  function sourceDescriptor(quote){
    const mode=quoteMode(quote);

    if(mode==="bpi"){
      return {
        id:"bpi",
        label:"BPI Weighted",
        mode,
        type:"bpi",
        weighted:true
      };
    }

    if(mode==="global-bpi"){
      return {
        id:"global-bpi",
        label:"Global BPI Weighted",
        mode,
        type:"global-bpi",
        weighted:true
      };
    }

    return {
      id:"global-bpi-unweighted",
      label:"Unweighted",
      mode:"off",
      type:"global-bpi-unweighted",
      weighted:false
    };
  }

  function quotePoint(quote,{now=Date.now()}={}){
    const price=positive(quote?.price_usd??quote?.priceUsd);
    if(!Number.isFinite(price))return null;

    const t=Math.floor(now/LIVE_BUCKET_MS)*LIVE_BUCKET_MS;
    return {
      t,
      open:price,
      high:price,
      low:price,
      close:price,
      price,
      bucket_high_usd:price,
      bucket_low_usd:price,
      live:true,
      canonical:true,
      mode:quoteMode(quote),
      provider:quote?.provider||"bitavg",
      source_observed_at:quote?.observed_at??quote?.updated_at??null
    };
  }

  function mergeLive(points,quote,{now=Date.now()}={}){
    const normalized=normalize(points,{now,trim:true});
    const live=quotePoint(quote,{now});
    if(!live)return normalized;

    const last=normalized.at(-1);
    if(last&&Math.abs(last.t-live.t)<LIVE_BUCKET_MS){
      const open=positive(last.open);
      const high=positive(last.high);
      const low=positive(last.low);
      normalized[normalized.length-1]={
        ...last,
        ...live,
        t:Math.max(last.t,live.t),
        open:Number.isFinite(open)?open:live.price,
        high:Math.max(Number.isFinite(high)?high:live.price,live.price),
        low:Math.min(Number.isFinite(low)?low:live.price,live.price),
        close:live.price,
        price:live.price,
        bucket_high_usd:Math.max(Number.isFinite(high)?high:live.price,live.price),
        bucket_low_usd:Math.min(Number.isFinite(low)?low:live.price,live.price)
      };
    }else{
      const prior=positive(last?.close??last?.price);
      normalized.push({
        ...live,
        open:Number.isFinite(prior)?prior:live.price,
        high:Number.isFinite(prior)?Math.max(prior,live.price):live.price,
        low:Number.isFinite(prior)?Math.min(prior,live.price):live.price,
        bucket_high_usd:Number.isFinite(prior)?Math.max(prior,live.price):live.price,
        bucket_low_usd:Number.isFinite(prior)?Math.min(prior,live.price):live.price
      });
    }

    return normalize(normalized,{now,trim:true});
  }

  function cadence(rows){
    const intervals=[];
    for(let index=1;index<rows.length;index+=1){
      const gap=rows[index].t-rows[index-1].t;
      if(gap>0&&Number.isFinite(gap))intervals.push(gap);
    }
    intervals.sort((a,b)=>a-b);
    return {
      medianIntervalMs:intervals.length?intervals[Math.floor(intervals.length/2)]:NaN,
      largestGapMs:intervals.length?Math.max(...intervals):NaN
    };
  }

  function stats(points,quote=null,now=Date.now()){
    const rows=normalize(points,{now,trim:true});
    if(!rows.length){
      return {
        points:0,current:NaN,open:NaN,high:NaN,low:NaN,range:NaN,rangePct:NaN,
        positionPct:NaN,change:NaN,changePct:NaN,coveragePct:0,
        firstTime:NaN,lastTime:NaN,ageMs:NaN,medianIntervalMs:NaN,largestGapMs:NaN
      };
    }

    const first=rows[0];
    const last=rows.at(-1);
    const canonical=positive(quote?.price_usd??quote?.priceUsd);
    const current=Number.isFinite(canonical)?canonical:positive(last.close??last.price);
    const open=positive(first.open??first.price);
    const highs=rows.map(row=>positive(row.high??row.price)).filter(Number.isFinite);
    const lows=rows.map(row=>positive(row.low??row.price)).filter(Number.isFinite);
    const high=highs.length?Math.max(...highs):current;
    const low=lows.length?Math.min(...lows):current;
    const range=Number.isFinite(high)&&Number.isFinite(low)?high-low:NaN;
    const rangePct=Number.isFinite(range)&&low>0?range/low*100:NaN;
    const rawPosition=Number.isFinite(current)&&Number.isFinite(low)&&Number.isFinite(range)&&range>0
      ? (current-low)/range*100
      : NaN;
    const positionPct=Number.isFinite(rawPosition)?Math.max(0,Math.min(100,rawPosition)):NaN;
    const change=Number.isFinite(current)&&Number.isFinite(open)?current-open:NaN;
    const changePct=Number.isFinite(change)&&open>0?change/open*100:NaN;
    const span=Math.max(0,last.t-first.t);
    const {medianIntervalMs,largestGapMs}=cadence(rows);

    return {
      points:rows.length,
      current,
      open,
      high,
      low,
      range,
      rangePct,
      positionPct,
      positionOutside:Number.isFinite(rawPosition)?(rawPosition<0||rawPosition>100):false,
      change,
      changePct,
      coveragePct:Math.min(100,span/DAY_MS*100),
      firstTime:first.t,
      lastTime:last.t,
      ageMs:Math.max(0,now-last.t),
      medianIntervalMs,
      largestGapMs
    };
  }

  function displayPoints(points,{maxPoints=720,now=Date.now()}={}){
    const rows=normalize(points,{now,trim:true});
    if(rows.length<=maxPoints)return rows;

    const groupSize=Math.max(1,Math.ceil(rows.length/maxPoints));
    const output=[];

    for(let index=0;index<rows.length;index+=groupSize){
      const group=rows.slice(index,index+groupSize);
      if(!group.length)continue;
      const first=group[0];
      const last=group.at(-1);
      const highs=group.map(row=>positive(row.high)).filter(Number.isFinite);
      const lows=group.map(row=>positive(row.low)).filter(Number.isFinite);

      output.push({
        ...last,
        open:positive(first.open) || last.open,
        high:highs.length?Math.max(...highs):last.high,
        low:lows.length?Math.min(...lows):last.low,
        close:positive(last.close??last.price),
        price:positive(last.close??last.price),
        bucket_high_usd:highs.length?Math.max(...highs):last.high,
        bucket_low_usd:lows.length?Math.min(...lows):last.low,
        display_bucket_count:group.length
      });
    }

    return output;
  }

  W.ZZXHighLow24HModel=Object.freeze({
    __version:4,
    DAY_MS,
    LIVE_BUCKET_MS,
    normalize,
    quoteMode,
    sourceDescriptor,
    quotePoint,
    mergeLive,
    stats,
    displayPoints
  });
})();
