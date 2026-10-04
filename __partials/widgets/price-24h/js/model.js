(function(){
  "use strict";

  const W=window;
  if(W.ZZXPrice24HModel?.__version>=4)return;

  const DAY_MS=24*60*60*1000;
  const LIVE_BUCKET_MS=15_000;
  const MODES=new Set(["off","bpi","global-bpi"]);

  const finite=value=>{
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
    const byTime=new Map();
    const cutoff=now-DAY_MS;

    for(const raw of Array.isArray(points)?points:[]){
      if(!raw||typeof raw!=="object")continue;
      const t=timestamp(raw);
      const price=positive(raw.price??raw.close??raw.price_usd??raw.bpi_usd);
      if(!Number.isFinite(t)||!Number.isFinite(price))continue;
      if(trim&&t<cutoff-60_000)continue;

      const open=positive(raw.open);
      const high=positive(raw.high);
      const low=positive(raw.low);
      const close=positive(raw.close);

      byTime.set(t,{
        ...raw,
        t,
        price,
        open:Number.isFinite(open)?open:price,
        high:Number.isFinite(high)?high:price,
        low:Number.isFinite(low)?low:price,
        close:Number.isFinite(close)?close:price,
        volume_24h_btc:Number.isFinite(finite(raw.volume_24h_btc))
          ? finite(raw.volume_24h_btc)
          : null
      });
    }

    return [...byTime.values()].sort((a,b)=>a.t-b.t);
  }

  function quoteMode(quote){
    const mode=String(quote?.mode??W.ZZXPrice?.mode?.()??"off");
    return MODES.has(mode)?mode:"off";
  }

  function quotePoint(quote,{now=Date.now()}={}){
    const price=positive(quote?.price_usd??quote?.priceUsd);
    if(!Number.isFinite(price))return null;

    const t=Math.floor(now/LIVE_BUCKET_MS)*LIVE_BUCKET_MS;
    const observedAt=quote?.observed_at??quote?.updated_at??null;

    return {
      t,
      open:price,
      high:price,
      low:price,
      close:price,
      price,
      volume_24h_btc:Number.isFinite(finite(quote?.volume_24h_btc))
        ? finite(quote.volume_24h_btc)
        : null,
      live:true,
      canonical:true,
      mode:quoteMode(quote),
      source_observed_at:observedAt,
      provider:quote?.provider||"bitavg"
    };
  }

  function mergeLive(points,quote,{now=Date.now()}={}){
    const normalized=normalize(points,{now,trim:true});
    const live=quotePoint(quote,{now});
    if(!live)return normalized;

    const last=normalized.at(-1);

    if(last&&last.t===live.t){
      normalized[normalized.length-1]={
        ...last,
        ...live,
        open:positive(last.open) || live.price,
        high:Math.max(positive(last.high)||live.price,live.price),
        low:Math.min(positive(last.low)||live.price,live.price),
        close:live.price,
        price:live.price
      };
    }else{
      const priorClose=positive(last?.close??last?.price);
      normalized.push({
        ...live,
        open:Number.isFinite(priorClose)?priorClose:live.price,
        high:Number.isFinite(priorClose)?Math.max(priorClose,live.price):live.price,
        low:Number.isFinite(priorClose)?Math.min(priorClose,live.price):live.price
      });
    }

    return normalize(normalized,{now,trim:true});
  }

  function stats(points,now=Date.now()){
    const rows=normalize(points,{now,trim:true});

    if(!rows.length){
      return {
        points:0,
        current:NaN,
        open:NaN,
        high:NaN,
        low:NaN,
        change:NaN,
        changePct:NaN,
        range:NaN,
        rangePct:NaN,
        coveragePct:0,
        firstTime:NaN,
        lastTime:NaN,
        ageMs:NaN,
        medianIntervalMs:NaN,
        largestGapMs:NaN
      };
    }

    const first=rows[0];
    const last=rows.at(-1);
    const open=positive(first.open??first.price);
    const current=positive(last.close??last.price);
    const highs=rows.map(row=>positive(row.high??row.price)).filter(Number.isFinite);
    const lows=rows.map(row=>positive(row.low??row.price)).filter(Number.isFinite);
    const high=highs.length?Math.max(...highs):current;
    const low=lows.length?Math.min(...lows):current;
    const change=Number.isFinite(open)&&Number.isFinite(current)?current-open:NaN;
    const changePct=Number.isFinite(change)&&open>0?change/open*100:NaN;
    const range=Number.isFinite(high)&&Number.isFinite(low)?high-low:NaN;
    const rangePct=Number.isFinite(range)&&low>0?range/low*100:NaN;
    const span=Math.max(0,last.t-first.t);
    const coveragePct=Math.min(100,span/DAY_MS*100);
    const intervals=[];

    for(let index=1;index<rows.length;index+=1){
      const gap=rows[index].t-rows[index-1].t;
      if(gap>0&&Number.isFinite(gap))intervals.push(gap);
    }

    intervals.sort((a,b)=>a-b);
    const medianIntervalMs=intervals.length
      ? intervals[Math.floor(intervals.length/2)]
      : NaN;
    const largestGapMs=intervals.length?Math.max(...intervals):NaN;

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
      coveragePct,
      firstTime:first.t,
      lastTime:last.t,
      ageMs:Math.max(0,now-last.t),
      medianIntervalMs,
      largestGapMs
    };
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

  function recipe({renderer="line",sma20=false,ema50=false,stats=null}={}){
    const normalizedRenderer=["area","line","candles"].includes(renderer)
      ? renderer
      : "line";

    const overlays=[];

    if(normalizedRenderer!=="candles"){
      if(sma20){
        overlays.push({
          metric:"price",
          transform:"sma_20",
          stroke:"#e6a42b",
          width:1.1,
          dash:[4,3],
          label:"SMA 20"
        });
      }

      if(ema50){
        overlays.push({
          metric:"price",
          transform:"ema_50",
          stroke:"#9aa67a",
          width:1,
          dash:[2,3],
          label:"EMA 50"
        });
      }
    }

    const referenceLines=[];
    if(stats&&Number.isFinite(stats.open)){
      referenceLines.push({
        value:stats.open,
        label:"24h open",
        stroke:"rgba(230,164,43,.44)",
        dash:[4,4]
      });
    }

    return {
      id:`price24h__${normalizedRenderer}`,
      label:`Price · 24h · ${normalizedRenderer}`,
      metric:normalizedRenderer==="candles"?"ohlc":"price",
      transform:"raw",
      renderer:normalizedRenderer,
      stroke:"#c0d674",
      accent:"#e6a42b",
      closeLineStroke:"#c0d674",
      showCloseLine:true,
      overlays,
      referenceLines
    };
  }

  W.ZZXPrice24HModel=Object.freeze({
    __version:4,
    DAY_MS,
    LIVE_BUCKET_MS,
    normalize,
    quotePoint,
    mergeLive,
    stats,
    sourceDescriptor,
    recipe
  });
})();
