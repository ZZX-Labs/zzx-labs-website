(function(){
  "use strict";

  const W=window;

  if(W.ZZXPrice24HModel?.__version>=1)return;

  const DAY_MS=24*60*60*1000;

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

  function normalize(points){
    const byTime=new Map();

    for(const raw of Array.isArray(points)?points:[]){
      if(!raw||typeof raw!=="object")continue;
      const t=timestamp(raw);
      const price=positive(raw.price??raw.close??raw.price_usd??raw.bpi_usd);
      if(!Number.isFinite(t)||!Number.isFinite(price))continue;

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

  function selectionPoint(selection){
    const price=positive(
      selection?.priceUsd??
      selection?.price_usd??
      W.ZZXSelectedPriceUsd
    );

    if(!Number.isFinite(price))return null;

    const high=positive(selection?.highUsd??selection?.high_usd);
    const low=positive(selection?.lowUsd??selection?.low_usd);
    const volume=finite(selection?.volumeBtc??selection?.volume_24h_btc);
    const rawTime=selection?.timestamp??selection?.updated_at;
    const parsed=new Date(rawTime||Date.now()).getTime();
    const t=Number.isFinite(parsed)?parsed:Date.now();

    return {
      t,
      open:price,
      high:Number.isFinite(high)?high:price,
      low:Number.isFinite(low)?low:price,
      close:price,
      price,
      volume_24h_btc:Number.isFinite(volume)?volume:null,
      live:true
    };
  }

  function mergeLive(points,selection){
    const normalized=normalize(points);
    const live=selectionPoint(selection);
    if(!live)return normalized;

    const tolerance=1250;
    const last=normalized.at(-1);

    if(last&&Math.abs(last.t-live.t)<=tolerance){
      normalized[normalized.length-1]={
        ...last,
        ...live,
        open:last.open,
        high:Math.max(last.high??live.price,live.high??live.price),
        low:Math.min(last.low??live.price,live.low??live.price)
      };
      return normalized;
    }

    normalized.push(live);
    normalized.sort((a,b)=>a.t-b.t);
    return normalized;
  }

  function stats(points,now=Date.now()){
    const rows=normalize(points);

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

  function sourceDescriptor(selection,latest){
    const sourceType=String(selection?.sourceType||"bpi");

    const weighted=selection?.weightsEnabled!==false;

    if(sourceType==="global-bpi"){
      return {
        id:weighted?"global-bpi":"global-bpi-unweighted",
        compatibility:null,
        label:`Global BPI · ${weighted?"weighted":"unweighted"}`,
        type:"global-bpi",
        country:"GLOBAL",
        weightsEnabled:weighted
      };
    }

    if(sourceType==="exchange"&&selection?.exchangeId){
      return {
        id:String(selection.exchangeId),
        compatibility:null,
        label:String(selection.label||selection.exchangeId),
        type:"exchange",
        exchangeId:String(selection.exchangeId),
        country:null
      };
    }

    const country=String(
      selection?.bpiCountry??
      selection?.countryCode??
      latest?.bpi_country??
      latest?.default_country??
      "US"
    ).toUpperCase();

    const defaultCountry=String(
      latest?.default_country??
      latest?.bpi_country??
      "US"
    ).toUpperCase();

    return {
      id:weighted
        ? `bpi:${country}`
        : `bpi-unweighted:${country}`,
      compatibility:
        weighted && country===defaultCountry
          ? "bpi"
          : null,
      label:`BPI · ${country} · ${weighted?"weighted":"unweighted"}`,
      type:"bpi",
      country,
      defaultCountry,
      weightsEnabled:weighted
    };
  }

  function recipe({renderer="area",sma20=true,ema50=false,stats=null}={}){
    const normalizedRenderer=["area","line","candles"].includes(renderer)
      ? renderer
      : "area";

    const overlays=[];

    if(normalizedRenderer!=="candles"){
      if(sma20){
        overlays.push({
          metric:"price",
          transform:"sma_20",
          stroke:"#e6a42b",
          width:1.15,
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

    if(stats){
      if(Number.isFinite(stats.high)){
        referenceLines.push({
          value:stats.high,
          label:"24h H",
          stroke:"rgba(192,214,116,.55)"
        });
      }

      if(Number.isFinite(stats.low)){
        referenceLines.push({
          value:stats.low,
          label:"24h L",
          stroke:"rgba(214,116,116,.55)"
        });
      }

      if(Number.isFinite(stats.open)){
        referenceLines.push({
          value:stats.open,
          label:"24h open",
          stroke:"rgba(230,164,43,.52)"
        });
      }
    }

    return {
      id:`price24h__${normalizedRenderer}`,
      label:`Price · 24h · ${normalizedRenderer}`,
      metric:normalizedRenderer==="candles"?"ohlc":"price",
      transform:"raw",
      renderer:normalizedRenderer,
      overlays,
      referenceLines
    };
  }

  W.ZZXPrice24HModel=Object.freeze({
    __version:1,
    DAY_MS,
    normalize,
    selectionPoint,
    mergeLive,
    stats,
    sourceDescriptor,
    recipe
  });
})();
