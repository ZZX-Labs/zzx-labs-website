(function(){
  "use strict";

  const W=window;

  if(W.ZZXHighLow24HModel?.__version>=1)return;

  const DAY_MS=24*60*60*1000;

  const finite=value=>{
    const number=Number(value);
    return Number.isFinite(number)
      ? number
      : NaN;
  };

  const positive=value=>{
    const number=finite(value);
    return number>0
      ? number
      : NaN;
  };

  const nonnegative=value=>{
    const number=finite(value);
    return number>=0
      ? number
      : NaN;
  };

  function timestamp(point){
    const raw=
      point?.t ??
      point?.ts_ms ??
      point?.timestamp ??
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

      const price=positive(
        raw.price ??
        raw.price_usd ??
        raw.close
      );

      if(
        !Number.isFinite(t) ||
        !Number.isFinite(price)
      ){
        continue;
      }

      const high24=positive(
        raw.high_24h ??
        raw.high_24h_usd
      );

      const low24=positive(
        raw.low_24h ??
        raw.low_24h_usd
      );

      const volumeClose=nonnegative(
        raw.volume_close_24h_btc ??
        raw.volume_24h_btc
      );

      const volumeOpen=nonnegative(
        raw.volume_open_24h_btc
      );

      const volumeHigh=nonnegative(
        raw.volume_high_24h_btc
      );

      const volumeLow=nonnegative(
        raw.volume_low_24h_btc
      );

      const closeVolume=
        Number.isFinite(volumeClose)
          ? volumeClose
          : NaN;

      const openVolume=
        Number.isFinite(volumeOpen)
          ? volumeOpen
          : closeVolume;

      const highVolume=
        Number.isFinite(volumeHigh)
          ? Math.max(
              volumeHigh,
              openVolume,
              closeVolume
            )
          : (
              Number.isFinite(closeVolume)
                ? Math.max(
                    openVolume,
                    closeVolume
                  )
                : NaN
            );

      const lowVolume=
        Number.isFinite(volumeLow)
          ? Math.min(
              volumeLow,
              openVolume,
              closeVolume
            )
          : (
              Number.isFinite(closeVolume)
                ? Math.min(
                    openVolume,
                    closeVolume
                  )
                : NaN
            );

      byTime.set(
        t,
        {
          ...raw,
          t,
          price,
          high_24h:
            Number.isFinite(high24)
              ? high24
              : null,
          low_24h:
            Number.isFinite(low24)
              ? low24
              : null,
          volume_24h_btc:
            Number.isFinite(closeVolume)
              ? closeVolume
              : null,
          volume_open_24h_btc:
            Number.isFinite(openVolume)
              ? openVolume
              : null,
          volume_high_24h_btc:
            Number.isFinite(highVolume)
              ? highVolume
              : null,
          volume_low_24h_btc:
            Number.isFinite(lowVolume)
              ? lowVolume
              : null,
          volume_close_24h_btc:
            Number.isFinite(closeVolume)
              ? closeVolume
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
    const price=positive(
      selection?.priceUsd ??
      selection?.price_usd ??
      W.ZZXSelectedPriceUsd
    );

    if(!Number.isFinite(price)){
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

    const high24=positive(
      selection?.highUsd ??
      selection?.high_24h
    );

    const low24=positive(
      selection?.lowUsd ??
      selection?.low_24h
    );

    const volume=nonnegative(
      selection?.volumeBtc ??
      selection?.volume_24h_btc
    );

    return {
      t,
      price,
      high_24h:
        Number.isFinite(high24)
          ? high24
          : null,
      low_24h:
        Number.isFinite(low24)
          ? low24
          : null,
      volume_24h_btc:
        Number.isFinite(volume)
          ? volume
          : null,
      volume_open_24h_btc:
        Number.isFinite(volume)
          ? volume
          : null,
      volume_high_24h_btc:
        Number.isFinite(volume)
          ? volume
          : null,
      volume_low_24h_btc:
        Number.isFinite(volume)
          ? volume
          : null,
      volume_close_24h_btc:
        Number.isFinite(volume)
          ? volume
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

    const last=
      normalized.at(-1);

    if(
      last &&
      Math.abs(
        last.t-live.t
      )<=1250
    ){
      normalized[
        normalized.length-1
      ]={
        ...last,
        ...live,

        // Preserve the first observed rolling-volume value
        // and expand the intra-bucket volume H/L.
        volume_open_24h_btc:
          last.volume_open_24h_btc ??
          live.volume_open_24h_btc,

        volume_high_24h_btc:
          [
            last.volume_high_24h_btc,
            live.volume_close_24h_btc
          ]
            .map(nonnegative)
            .filter(Number.isFinite)
            .reduce(
              (a,b)=>Math.max(a,b),
              -Infinity
            ),

        volume_low_24h_btc:
          [
            last.volume_low_24h_btc,
            live.volume_close_24h_btc
          ]
            .map(nonnegative)
            .filter(Number.isFinite)
            .reduce(
              (a,b)=>Math.min(a,b),
              Infinity
            )
      };

      const row=
        normalized[
          normalized.length-1
        ];

      if(
        !Number.isFinite(
          row.volume_high_24h_btc
        )
      ){
        row.volume_high_24h_btc=
          null;
      }

      if(
        !Number.isFinite(
          row.volume_low_24h_btc
        )
      ){
        row.volume_low_24h_btc=
          null;
      }

      return normalized;
    }

    normalized.push(live);
    normalized.sort(
      (a,b)=>a.t-b.t
    );

    return normalized;
  }

  function median(values){
    const valid=
      values
        .map(finite)
        .filter(Number.isFinite)
        .sort((a,b)=>a-b);

    if(!valid.length)return NaN;

    const middle=
      Math.floor(
        valid.length/2
      );

    return valid.length%2
      ? valid[middle]
      : (
          valid[middle-1]+
          valid[middle]
        )/2;
  }

  function stats(points,now=Date.now()){
    const rows=normalize(points);

    if(!rows.length){
      return {
        points:0,
        priceCurrent:NaN,
        priceOpen:NaN,
        priceHigh24:NaN,
        priceLow24:NaN,
        priceRange:NaN,
        priceRangePct:NaN,
        pricePositionPct:NaN,
        priceChange:NaN,
        priceChangePct:NaN,
        volumeCurrent:NaN,
        volumeOpen:NaN,
        volumeHigh:NaN,
        volumeLow:NaN,
        volumeRange:NaN,
        volumeRangePct:NaN,
        volumeChange:NaN,
        volumeChangePct:NaN,
        volumeAverage:NaN,
        volumeMedian:NaN,
        coveragePct:0,
        medianIntervalMs:NaN,
        largestGapMs:NaN,
        ageMs:NaN
      };
    }

    const first=rows[0];
    const last=rows.at(-1);

    const priceCurrent=
      positive(last.price);

    const priceOpen=
      positive(first.price);

    const priceHigh24=
      positive(last.high_24h);

    const priceLow24=
      positive(last.low_24h);

    const priceRange=
      Number.isFinite(priceHigh24) &&
      Number.isFinite(priceLow24)
        ? priceHigh24-priceLow24
        : NaN;

    const priceRangePct=
      Number.isFinite(priceRange) &&
      priceLow24>0
        ? priceRange/priceLow24*100
        : NaN;

    const pricePositionPct=
      Number.isFinite(priceCurrent) &&
      Number.isFinite(priceLow24) &&
      Number.isFinite(priceRange) &&
      priceRange>0
        ? (
            (
              priceCurrent-priceLow24
            )/
            priceRange*
            100
          )
        : NaN;

    const priceChange=
      Number.isFinite(priceCurrent) &&
      Number.isFinite(priceOpen)
        ? priceCurrent-priceOpen
        : NaN;

    const priceChangePct=
      Number.isFinite(priceChange) &&
      priceOpen>0
        ? priceChange/priceOpen*100
        : NaN;

    const volumeRows=
      rows.filter(
        row=>
          Number.isFinite(
            nonnegative(
              row.volume_close_24h_btc
            )
          )
      );

    const volumeCurrent=
      volumeRows.length
        ? nonnegative(
            volumeRows.at(-1)
              .volume_close_24h_btc
          )
        : NaN;

    const volumeOpen=
      volumeRows.length
        ? nonnegative(
            volumeRows[0]
              .volume_open_24h_btc
          )
        : NaN;

    const volumeHighValues=
      rows
        .map(
          row=>
            nonnegative(
              row.volume_high_24h_btc
            )
        )
        .filter(Number.isFinite);

    const volumeLowValues=
      rows
        .map(
          row=>
            nonnegative(
              row.volume_low_24h_btc
            )
        )
        .filter(Number.isFinite);

    const volumeCloseValues=
      rows
        .map(
          row=>
            nonnegative(
              row.volume_close_24h_btc
            )
        )
        .filter(Number.isFinite);

    const volumeHigh=
      volumeHighValues.length
        ? Math.max(
            ...volumeHighValues
          )
        : NaN;

    const volumeLow=
      volumeLowValues.length
        ? Math.min(
            ...volumeLowValues
          )
        : NaN;

    const volumeRange=
      Number.isFinite(volumeHigh) &&
      Number.isFinite(volumeLow)
        ? volumeHigh-volumeLow
        : NaN;

    const volumeRangePct=
      Number.isFinite(volumeRange) &&
      volumeLow>0
        ? volumeRange/volumeLow*100
        : NaN;

    const volumeChange=
      Number.isFinite(volumeCurrent) &&
      Number.isFinite(volumeOpen)
        ? volumeCurrent-volumeOpen
        : NaN;

    const volumeChangePct=
      Number.isFinite(volumeChange) &&
      volumeOpen>0
        ? volumeChange/volumeOpen*100
        : NaN;

    const volumeAverage=
      volumeCloseValues.length
        ? volumeCloseValues.reduce(
            (sum,value)=>sum+value,
            0
          )/
          volumeCloseValues.length
        : NaN;

    const volumeMedian=
      median(
        volumeCloseValues
      );

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
        Number.isFinite(gap) &&
        gap>0
      ){
        intervals.push(gap);
      }
    }

    const medianIntervalMs=
      median(intervals);

    const largestGapMs=
      intervals.length
        ? Math.max(
            ...intervals
          )
        : NaN;

    return {
      points:rows.length,

      priceCurrent,
      priceOpen,
      priceHigh24,
      priceLow24,
      priceRange,
      priceRangePct,
      pricePositionPct,
      priceChange,
      priceChangePct,

      volumeCurrent,
      volumeOpen,
      volumeHigh,
      volumeLow,
      volumeRange,
      volumeRangePct,
      volumeChange,
      volumeChangePct,
      volumeAverage,
      volumeMedian,

      coveragePct,
      firstTime:first.t,
      lastTime:last.t,
      medianIntervalMs,
      largestGapMs,
      ageMs:
        Math.max(
          0,
          now-last.t
        )
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
    priceMode="area",
    volumeMode="candles-line"
  }={}){
    const normalizedPrice=[
      "area",
      "line",
      "range"
    ].includes(priceMode)
      ? priceMode
      : "area";

    const normalizedVolume=[
      "candles-line",
      "candles",
      "line"
    ].includes(volumeMode)
      ? volumeMode
      : "candles-line";

    return {
      priceMode:normalizedPrice,
      volumeMode:normalizedVolume,
      showPriceLine:true,
      showPriceHighLow:true,
      showPriceRangeBand:true,
      showVolumeCandles:
        normalizedVolume!=="line",
      showVolumeLine:
        normalizedVolume!=="candles"
    };
  }

  W.ZZXHighLow24HModel=
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
