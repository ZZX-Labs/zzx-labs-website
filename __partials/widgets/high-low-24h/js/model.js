(function(){
  "use strict";

  const W=window;

  if(W.ZZXVolume24HModel?.__version>=1)return;

  const DAY_MS=24*60*60*1000;

  const finite=value=>{
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  };

  const nonnegative=value=>{
    const number=finite(value);
    return number>=0?number:NaN;
  };

  function timestamp(point){
    const raw=
      point?.t??
      point?.ts_ms??
      point?.timestamp??
      point?.updated_at;

    if(typeof raw==="number"){
      return raw<1e11
        ? raw*1000
        : raw;
    }

    const parsed=
      new Date(raw).getTime();

    return Number.isFinite(parsed)
      ? parsed
      : NaN;
  }

  function rawVolume(point){
    return nonnegative(
      point?.volume_close_24h_btc ??
      point?.volume_24h_btc
    );
  }

  function normalize(points){
    const byTime=new Map();

    for(
      const raw
      of Array.isArray(points)
        ? points
        : []
    ){
      if(
        !raw ||
        typeof raw!=="object"
      ){
        continue;
      }

      const t=timestamp(raw);
      const close=rawVolume(raw);

      if(
        !Number.isFinite(t) ||
        !Number.isFinite(close)
      ){
        continue;
      }

      const open=nonnegative(
        raw.volume_open_24h_btc
      );

      const high=nonnegative(
        raw.volume_high_24h_btc
      );

      const low=nonnegative(
        raw.volume_low_24h_btc
      );

      const normalizedOpen=
        Number.isFinite(open)
          ? open
          : close;

      const normalizedHigh=
        Number.isFinite(high)
          ? Math.max(
              high,
              normalizedOpen,
              close
            )
          : Math.max(
              normalizedOpen,
              close
            );

      const normalizedLow=
        Number.isFinite(low)
          ? Math.min(
              low,
              normalizedOpen,
              close
            )
          : Math.min(
              normalizedOpen,
              close
            );

      byTime.set(
        t,
        {
          ...raw,
          t,

          // Chart-engine candle fields intentionally contain
          // rolling-24h-volume OHLC, not price OHLC.
          open:normalizedOpen,
          high:normalizedHigh,
          low:normalizedLow,
          close,
          volume_24h_btc:close,
          volume_open_24h_btc:
            normalizedOpen,
          volume_high_24h_btc:
            normalizedHigh,
          volume_low_24h_btc:
            normalizedLow,
          volume_close_24h_btc:
            close,

          // Retain the contemporaneous price separately.
          source_price_usd:Number.isFinite(
            finite(
              raw.source_price_usd ??
              raw.price ??
              raw.price_usd
            )
          )
            ? finite(
                raw.source_price_usd ??
                raw.price ??
                raw.price_usd
              )
            : null
        }
      );
    }

    return [
      ...byTime.values()
    ].sort(
      (a,b)=>a.t-b.t
    );
  }

  function selectionPoint(selection){
    const volume=nonnegative(
      selection?.volumeBtc ??
      selection?.volume_24h_btc
    );

    if(!Number.isFinite(volume)){
      return null;
    }

    const rawTime=
      selection?.timestamp ??
      selection?.updated_at;

    const parsed=
      new Date(
        rawTime||
        Date.now()
      ).getTime();

    const t=
      Number.isFinite(parsed)
        ? parsed
        : Date.now();

    const price=finite(
      selection?.priceUsd ??
      selection?.price_usd ??
      W.ZZXSelectedPriceUsd
    );

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
      source_price_usd:
        Number.isFinite(price)
          ? price
          : null,
      live:true
    };
  }

  function mergeLive(points,selection){
    const normalized=
      normalize(points);

    const live=
      selectionPoint(selection);

    if(!live){
      return normalized;
    }

    const tolerance=1250;
    const last=
      normalized.at(-1);

    if(
      last &&
      Math.abs(last.t-live.t)<=tolerance
    ){
      normalized[
        normalized.length-1
      ]={
        ...last,
        ...live,
        open:last.open,
        volume_open_24h_btc:
          last.volume_open_24h_btc,
        high:Math.max(
          last.high,
          live.close
        ),
        low:Math.min(
          last.low,
          live.close
        ),
        volume_high_24h_btc:
          Math.max(
            last.volume_high_24h_btc,
            live.close
          ),
        volume_low_24h_btc:
          Math.min(
            last.volume_low_24h_btc,
            live.close
          )
      };

      return normalized;
    }

    normalized.push(live);
    normalized.sort(
      (a,b)=>a.t-b.t
    );

    return normalized;
  }

  function median(values){
    if(!values.length)return NaN;

    const sorted=[
      ...values
    ].sort((a,b)=>a-b);

    const middle=
      Math.floor(
        sorted.length/2
      );

    return sorted.length%2
      ? sorted[middle]
      : (
          sorted[middle-1]+
          sorted[middle]
        )/2;
  }

  function stats(points,now=Date.now()){
    const rows=
      normalize(points);

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
        average:NaN,
        median:NaN,
        coveragePct:0,
        firstTime:NaN,
        lastTime:NaN,
        ageMs:NaN,
        medianIntervalMs:NaN,
        largestGapMs:NaN
      };
    }

    const first=
      rows[0];

    const last=
      rows.at(-1);

    const open=
      nonnegative(
        first.open
      );

    const current=
      nonnegative(
        last.close
      );

    const highs=
      rows
        .map(
          row=>
            nonnegative(row.high)
        )
        .filter(
          Number.isFinite
        );

    const lows=
      rows
        .map(
          row=>
            nonnegative(row.low)
        )
        .filter(
          Number.isFinite
        );

    const closes=
      rows
        .map(
          row=>
            nonnegative(row.close)
        )
        .filter(
          Number.isFinite
        );

    const high=
      highs.length
        ? Math.max(...highs)
        : current;

    const low=
      lows.length
        ? Math.min(...lows)
        : current;

    const change=
      Number.isFinite(open) &&
      Number.isFinite(current)
        ? current-open
        : NaN;

    const changePct=
      Number.isFinite(change) &&
      open>0
        ? change/open*100
        : NaN;

    const range=
      Number.isFinite(high) &&
      Number.isFinite(low)
        ? high-low
        : NaN;

    const rangePct=
      Number.isFinite(range) &&
      low>0
        ? range/low*100
        : NaN;

    const average=
      closes.length
        ? closes.reduce(
            (sum,value)=>
              sum+value,
            0
          )/closes.length
        : NaN;

    const medianValue=
      median(closes);

    const span=
      Math.max(
        0,
        last.t-first.t
      );

    const coveragePct=
      Math.min(
        100,
        span/DAY_MS*100
      );

    const intervals=[];

    for(
      let index=1;
      index<rows.length;
      index+=1
    ){
      const gap=
        rows[index].t-
        rows[index-1].t;

      if(
        gap>0 &&
        Number.isFinite(gap)
      ){
        intervals.push(gap);
      }
    }

    intervals.sort(
      (a,b)=>a-b
    );

    const medianIntervalMs=
      intervals.length
        ? intervals[
            Math.floor(
              intervals.length/2
            )
          ]
        : NaN;

    const largestGapMs=
      intervals.length
        ? Math.max(...intervals)
        : NaN;

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
      median:medianValue,
      coveragePct,
      firstTime:first.t,
      lastTime:last.t,
      ageMs:
        Math.max(
          0,
          now-last.t
        ),
      medianIntervalMs,
      largestGapMs
    };
  }

  function sourceDescriptor(selection,latest){
    const sourceType=
      String(
        selection?.sourceType||
        "bpi"
      );

    const weighted=
      selection?.weightsEnabled!==false;

    if(sourceType==="global-bpi"){
      return {
        id:weighted
          ? "global-bpi"
          : "global-bpi-unweighted",
        compatibility:null,
        label:
          `Global BPI · `+
          `${weighted?"weighted":"unweighted"}`,
        type:"global-bpi",
        country:"GLOBAL",
        weightsEnabled:weighted
      };
    }

    if(
      sourceType==="exchange" &&
      selection?.exchangeId
    ){
      return {
        id:String(
          selection.exchangeId
        ),
        compatibility:null,
        label:String(
          selection.label||
          selection.exchangeId
        ),
        type:"exchange",
        exchangeId:String(
          selection.exchangeId
        ),
        country:null,
        weightsEnabled:true
      };
    }

    const country=String(
      selection?.bpiCountry ??
      selection?.countryCode ??
      latest?.bpi_country ??
      latest?.default_country ??
      "US"
    ).toUpperCase();

    const defaultCountry=String(
      latest?.default_country ??
      latest?.bpi_country ??
      "US"
    ).toUpperCase();

    return {
      id:weighted
        ? `bpi:${country}`
        : `bpi-unweighted:${country}`,
      compatibility:
        weighted &&
        country===defaultCountry
          ? "bpi"
          : null,
      label:
        `BPI · ${country} · `+
        `${weighted?"weighted":"unweighted"}`,
      type:"bpi",
      country,
      defaultCountry,
      weightsEnabled:weighted
    };
  }

  function recipe({
    mode="candles-line",
    stats=null
  }={}){
    const normalizedMode=[
      "candles-line",
      "candles",
      "line"
    ].includes(mode)
      ? mode
      : "candles-line";

    const overlays=[];

    if(
      normalizedMode===
      "candles-line"
    ){
      overlays.push({
        metric:
          "volume_24h_btc",
        transform:"raw",
        stroke:"#e6a42b",
        width:1.55,
        dash:[],
        label:
          "24h volume close"
      });
    }

    const referenceLines=[];

    if(stats){
      if(
        Number.isFinite(
          stats.average
        )
      ){
        referenceLines.push({
          value:stats.average,
          label:"24h avg",
          stroke:
            "rgba(230,164,43,.48)",
          dash:[5,4]
        });
      }

      if(
        Number.isFinite(
          stats.high
        )
      ){
        referenceLines.push({
          value:stats.high,
          label:"24h H",
          stroke:
            "rgba(192,214,116,.38)",
          dash:[3,4]
        });
      }

      if(
        Number.isFinite(
          stats.low
        )
      ){
        referenceLines.push({
          value:stats.low,
          label:"24h L",
          stroke:
            "rgba(214,116,116,.38)",
          dash:[3,4]
        });
      }
    }

    return {
      id:
        `volume24h__${normalizedMode}`,
      label:
        `Volume · 24h · ${normalizedMode}`,
      metric:
        "volume_24h_btc",
      transform:"raw",
      renderer:
        normalizedMode==="line"
          ? "line"
          : "candles",
      stroke:"#c0d674",
      accent:"#e6a42b",
      overlays,
      referenceLines
    };
  }

  W.ZZXVolume24HModel=
    Object.freeze({
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
