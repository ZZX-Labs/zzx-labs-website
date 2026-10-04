(function(){
  "use strict";

  const W=window;
  if(W.ZZXVolume24HModel?.__version>=4)return;

  const DAY_MS=24*60*60*1000;
  const LIVE_BUCKET_MS=15_000;
  const MODES=new Set(["off","bpi","global-bpi"]);

  const finite=value=>{
    if(value==null||value==="")return NaN;
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  };

  const nonnegative=value=>{
    const number=finite(value);
    return number>=0?number:NaN;
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

      const close=nonnegative(raw.volume_close_24h_btc??raw.volume_24h_btc);
      const interval=nonnegative(raw.interval_volume_btc);
      if(!Number.isFinite(close)&&!Number.isFinite(interval))continue;

      const open=nonnegative(raw.volume_open_24h_btc);
      const high=nonnegative(raw.volume_high_24h_btc);
      const low=nonnegative(raw.volume_low_24h_btc);
      const fallback=Number.isFinite(close)?close:0;
      const normalizedOpen=Number.isFinite(open)?open:fallback;
      const normalizedHigh=Number.isFinite(high)
        ? Math.max(high,normalizedOpen,fallback)
        : Math.max(normalizedOpen,fallback);
      const normalizedLow=Number.isFinite(low)
        ? Math.min(low,normalizedOpen,fallback)
        : Math.min(normalizedOpen,fallback);
      const sourcePrice=finite(raw.source_price_usd??raw.price??raw.price_usd??raw.close);

      byTime.set(t,{
        ...raw,
        t,
        open:normalizedOpen,
        high:normalizedHigh,
        low:normalizedLow,
        close:Number.isFinite(close)?close:fallback,
        volume_24h_btc:Number.isFinite(close)?close:null,
        volume_open_24h_btc:Number.isFinite(close)?normalizedOpen:null,
        volume_high_24h_btc:Number.isFinite(close)?normalizedHigh:null,
        volume_low_24h_btc:Number.isFinite(close)?normalizedLow:null,
        volume_close_24h_btc:Number.isFinite(close)?close:null,
        interval_volume_btc:Number.isFinite(interval)?interval:null,
        source_price_usd:Number.isFinite(sourcePrice)?sourcePrice:null
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

  function liveRollingVolume(quote,snapshot){
    const mode=quoteMode(quote);
    const source=snapshot&&typeof snapshot==="object"?snapshot:{};
    const region=String(
      quote?.region??
      source?.native_region??
      source?.bpi_country??
      source?.default_country??
      "US"
    ).toUpperCase();

    if(mode==="bpi"){
      const national=source?.national_bpi?.[region]||source?.bpi||{};
      const value=nonnegative(
        national?.volume_24h_btc??
        source?.volume_24h_btc??
        quote?.volume_24h_btc
      );
      return Number.isFinite(value)?value:NaN;
    }

    const global=source?.global_bpi||{};
    const value=nonnegative(
      global?.volume_24h_btc??
      source?.global_volume_24h_btc??
      W.ZZXGlobalBPI?.volume_24h_btc??
      quote?.volume_24h_btc??
      source?.volume_24h_btc
    );
    return Number.isFinite(value)?value:NaN;
  }

  function livePoint(quote,snapshot,{now=Date.now()}={}){
    const volume=liveRollingVolume(quote,snapshot);
    if(!Number.isFinite(volume))return null;

    const price=finite(quote?.price_usd??quote?.priceUsd);
    const t=Math.floor(now/LIVE_BUCKET_MS)*LIVE_BUCKET_MS;

    return {
      t,
      open:volume,
      high:volume,
      low:volume,
      close:volume,
      volume_24h_btc:volume,
      volume_open_24h_btc:volume,
      volume_high_24h_btc:volume,
      volume_low_24h_btc:volume,
      volume_close_24h_btc:volume,
      interval_volume_btc:null,
      source_price_usd:Number.isFinite(price)?price:null,
      live:true,
      canonical:true,
      mode:quoteMode(quote),
      provider:quote?.provider||"bitavg",
      source_observed_at:
        snapshot?.observed_at??
        snapshot?.updated_at??
        quote?.observed_at??
        null
    };
  }

  function mergeLive(points,quote,snapshot,{now=Date.now()}={}){
    const normalized=normalize(points,{now,trim:true});
    const live=livePoint(quote,snapshot,{now});
    if(!live)return normalized;

    const last=normalized.at(-1);
    if(last&&Math.abs(last.t-live.t)<LIVE_BUCKET_MS){
      const previousOpen=nonnegative(last.volume_open_24h_btc??last.open);
      const previousHigh=nonnegative(last.volume_high_24h_btc??last.high);
      const previousLow=nonnegative(last.volume_low_24h_btc??last.low);
      const open=Number.isFinite(previousOpen)?previousOpen:live.close;
      const high=Math.max(Number.isFinite(previousHigh)?previousHigh:live.close,live.close,open);
      const low=Math.min(Number.isFinite(previousLow)?previousLow:live.close,live.close,open);

      normalized[normalized.length-1]={
        ...last,
        ...live,
        t:Math.max(last.t,live.t),
        open,
        high,
        low,
        close:live.close,
        volume_open_24h_btc:open,
        volume_high_24h_btc:high,
        volume_low_24h_btc:low,
        volume_close_24h_btc:live.close,
        interval_volume_btc:last.interval_volume_btc??null
      };
    }else{
      normalized.push(live);
    }

    return normalize(normalized,{now,trim:true});
  }

  function median(values){
    if(!values.length)return NaN;
    const sorted=[...values].sort((a,b)=>a-b);
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2
      ? sorted[middle]
      : (sorted[middle-1]+sorted[middle])/2;
  }

  function cadence(rows){
    const intervals=[];
    for(let index=1;index<rows.length;index+=1){
      const gap=rows[index].t-rows[index-1].t;
      if(gap>0&&Number.isFinite(gap))intervals.push(gap);
    }
    intervals.sort((a,b)=>a-b);
    return {
      medianIntervalMs:intervals.length
        ? intervals[Math.floor(intervals.length/2)]
        : NaN,
      largestGapMs:intervals.length?Math.max(...intervals):NaN
    };
  }

  function rollingStats(points,now=Date.now()){
    const rows=normalize(points,{now,trim:true})
      .filter(row=>Number.isFinite(nonnegative(row.volume_24h_btc)));

    if(!rows.length){
      return {
        points:0,current:NaN,open:NaN,high:NaN,low:NaN,change:NaN,
        changePct:NaN,range:NaN,rangePct:NaN,average:NaN,median:NaN,
        coveragePct:0,firstTime:NaN,lastTime:NaN,ageMs:NaN,
        medianIntervalMs:NaN,largestGapMs:NaN
      };
    }

    const first=rows[0];
    const last=rows.at(-1);
    const open=nonnegative(first.volume_open_24h_btc??first.volume_24h_btc);
    const current=nonnegative(last.volume_close_24h_btc??last.volume_24h_btc);
    const highs=rows.map(row=>nonnegative(row.volume_high_24h_btc??row.volume_24h_btc)).filter(Number.isFinite);
    const lows=rows.map(row=>nonnegative(row.volume_low_24h_btc??row.volume_24h_btc)).filter(Number.isFinite);
    const closes=rows.map(row=>nonnegative(row.volume_24h_btc)).filter(Number.isFinite);
    const high=highs.length?Math.max(...highs):current;
    const low=lows.length?Math.min(...lows):current;
    const change=Number.isFinite(open)&&Number.isFinite(current)?current-open:NaN;
    const changePct=Number.isFinite(change)&&open>0?change/open*100:NaN;
    const range=Number.isFinite(high)&&Number.isFinite(low)?high-low:NaN;
    const rangePct=Number.isFinite(range)&&low>0?range/low*100:NaN;
    const average=closes.length?closes.reduce((sum,value)=>sum+value,0)/closes.length:NaN;
    const span=Math.max(0,last.t-first.t);
    const {medianIntervalMs,largestGapMs}=cadence(rows);

    return {
      points:rows.length,
      current,
      open,
      high,
      low,
      change,
      changePct,
      range,
      rangePct,
      average,
      median:median(closes),
      coveragePct:Math.min(100,span/DAY_MS*100),
      firstTime:first.t,
      lastTime:last.t,
      ageMs:Math.max(0,now-last.t),
      medianIntervalMs,
      largestGapMs
    };
  }

  function intervalStats(points,now=Date.now()){
    const rows=normalize(points,{now,trim:true});
    const values=rows
      .map(row=>({t:row.t,value:nonnegative(row.interval_volume_btc)}))
      .filter(row=>Number.isFinite(row.value));

    if(!values.length){
      return {
        count:0,total:NaN,current:NaN,average:NaN,median:NaN,max:NaN,
        firstTime:NaN,lastTime:NaN
      };
    }

    const numbers=values.map(row=>row.value);
    return {
      count:values.length,
      total:numbers.reduce((sum,value)=>sum+value,0),
      current:numbers.at(-1),
      average:numbers.reduce((sum,value)=>sum+value,0)/numbers.length,
      median:median(numbers),
      max:Math.max(...numbers),
      firstTime:values[0].t,
      lastTime:values.at(-1).t
    };
  }

  function displayPoints(points,mode,{maxBars=360,now=Date.now()}={}){
    const rows=normalize(points,{now,trim:true});
    if(mode==="rolling-line"||rows.length<=maxBars)return rows;

    const groupSize=Math.max(1,Math.ceil(rows.length/maxBars));
    const output=[];

    for(let index=0;index<rows.length;index+=groupSize){
      const group=rows.slice(index,index+groupSize);
      const last=group.at(-1);
      if(!last)continue;

      if(mode==="interval-bars"){
        const intervals=group
          .map(row=>nonnegative(row.interval_volume_btc))
          .filter(Number.isFinite);
        if(!intervals.length)continue;
        output.push({
          ...last,
          interval_volume_btc:intervals.reduce((sum,value)=>sum+value,0),
          display_bucket_count:group.length
        });
      }else{
        output.push({
          ...last,
          display_bucket_count:group.length
        });
      }
    }

    return output;
  }

  function recipe({mode="rolling-bars",rolling=null,interval=null}={}){
    const normalizedMode=["rolling-bars","rolling-line","interval-bars"].includes(mode)
      ? mode
      : "rolling-bars";
    const intervalMode=normalizedMode==="interval-bars";
    const lineMode=normalizedMode==="rolling-line";
    const referenceLines=[];

    if(!lineMode){
      // Force a truthful zero baseline for bar charts without showing an extra label.
      referenceLines.push({value:0,stroke:"rgba(255,255,255,0)",dash:[]});
    }

    const average=intervalMode?interval?.average:rolling?.average;
    if(Number.isFinite(average)){
      referenceLines.push({
        value:average,
        label:intervalMode?"bucket avg":"24h avg",
        stroke:"rgba(230,164,43,.48)",
        dash:[5,4]
      });
    }

    return {
      id:`volume24h__${normalizedMode}`,
      label:intervalMode
        ? "Actual interval BTC volume"
        : lineMode
          ? "Rolling 24h BTC volume line"
          : "Rolling 24h BTC volume bars",
      metric:intervalMode?"interval_volume_btc":"volume_24h_btc",
      transform:"raw",
      renderer:lineMode?"line":"bars",
      stroke:"#c0d674",
      accent:"#e6a42b",
      overlays:[],
      referenceLines
    };
  }

  W.ZZXVolume24HModel=Object.freeze({
    __version:4,
    DAY_MS,
    LIVE_BUCKET_MS,
    normalize,
    sourceDescriptor,
    liveRollingVolume,
    livePoint,
    mergeLive,
    rollingStats,
    intervalStats,
    displayPoints,
    recipe
  });
})();
