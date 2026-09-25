(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerSelection?.__version>=8)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};

  function weightingMode(){
    const controlled=
      W.ZZXBPIWeightingController?.getMode?.();

    if(
      controlled==="off" ||
      controlled==="bpi" ||
      controlled==="global-bpi"
    ){
      return controlled;
    }

    const published=
      W.ZZXBPIWeighting?.mode;

    if(
      published==="off" ||
      published==="bpi" ||
      published==="global-bpi"
    ){
      return published;
    }

    try{
      const modern=
        W.localStorage.getItem(
          "zzx.bpi.weighting.mode.v2"
        );

      if(
        modern==="off" ||
        modern==="bpi" ||
        modern==="global-bpi"
      ){
        return modern;
      }

      const legacy=
        W.localStorage.getItem(
          "zzx.bpi.weights.enabled.v1"
        );

      return legacy==="false"
        ? "off"
        : "global-bpi";
    }catch(_){
      return "global-bpi";
    }
  }

  function median(values){
    const rows=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }

  function localConsensus(latest){
    const rows=latest?.exchanges&&typeof latest.exchanges==="object"
      ? Object.values(latest.exchanges)
      : [];

    const prices=rows
      .map(row=>positive(row?.raw_price_usd??row?.price_usd))
      .filter(Number.isFinite);

    const center=median(prices);
    if(!Number.isFinite(center)){
      return {center:NaN,bandPct:20,volumeLimit:1000000};
    }

    const deviations=prices.map(price=>Math.abs(price-center));
    const mad=median(deviations);
    const madPct=prices.length>=3&&Number.isFinite(mad)&&center>0
      ? mad/center*100
      : 0;

    const bandPct=prices.length<3
      ? 20
      : Math.min(20,Math.max(7.5,8*madPct));

    const plausibleVolumes=[];

    for(const row of rows){
      const price=positive(row?.raw_price_usd??row?.price_usd);
      if(!Number.isFinite(price))continue;

      const deviation=Math.abs(price-center)/center*100;
      if(deviation>bandPct)continue;

      const volume=positive(
        row?.raw_volume_24h_btc??row?.volume_24h_btc
      );
      if(Number.isFinite(volume))plausibleVolumes.push(volume);
    }

    const medianVolume=median(plausibleVolumes);
    const volumeLimit=Math.min(
      1000000,
      Math.max(
        100000,
        Number.isFinite(medianVolume)
          ? medianVolume*100
          : 100000
      )
    );

    return {center,bandPct,volumeLimit};
  }

  function exchangeEligible(config,id,rowOverride){
    const policy=config?.exchangesData?.sources?.[id]||{};
    const row=rowOverride??config?.latest?.exchanges?.[id];

    if(!row)return false;
    if(policy.enabled===false)return false;

    if(String(policy.status||"").startsWith("quarantined-")){
      return false;
    }

    if(row.index_eligible===false)return false;

    const reason=String(row.exclusion_reason||"");
    if(/outlier|quarantin|invalid|registry_quarantine/i.test(reason)){
      return false;
    }

    const price=positive(row.price_usd??row.raw_price_usd);
    if(!Number.isFinite(price))return false;

    const volume=finite(
      row.volume_24h_btc??row.raw_volume_24h_btc
    );
    if(Number.isFinite(volume)&&volume<0)return false;

    const sanity=localConsensus(config?.latest);

    if(Number.isFinite(sanity.center)&&sanity.center>0){
      const deviation=Math.abs(price-sanity.center)/sanity.center*100;
      if(deviation>sanity.bandPct)return false;
    }

    if(Number.isFinite(volume)&&volume>sanity.volumeLimit){
      return false;
    }

    return true;
  }

  function exchangeMap(config){
    const out=new Map();
    const e=config?.exchangesData;
    const sources=e?.sources;

    if(sources&&typeof sources==="object"){
      for(const [id,row] of Object.entries(sources)){
        if(row?.enabled===false)continue;
        if(String(row?.status||"").startsWith("quarantined-"))continue;
        out.set(id,{id,label:String(row?.label||row?.name||id)});
      }
    }

    const list=Array.isArray(e?.exchanges)?e.exchanges:Array.isArray(e)?e:null;
    if(list){
      for(const row of list){
        if(typeof row==="string")out.set(row,{id:row,label:row});
        else{
          const id=String(row?.id??row?.source??row?.key??"");
          if(id)out.set(id,{id,label:String(row?.label??row?.name??id)});
        }
      }
    }

    const latest=config?.latest?.exchanges;
    if(latest&&typeof latest==="object"){
      for(const [id,row] of Object.entries(latest)){
        if(!exchangeEligible(config,id,row))continue;
        if(!out.has(id))out.set(id,{id,label:String(row?.label||id)});
      }
    }

    return out;
  }

  function canonicalUnweighted(config){
    const latest=config?.latest;
    const rows=
      latest?.exchanges &&
      typeof latest.exchanges==="object"
        ? Object.entries(latest.exchanges)
        : [];

    const prices=[];

    for(const [id,row] of rows){
      const policy=
        config?.exchangesData?.sources?.[id]||{};

      if(policy.include_in_bpi===false)continue;
      if(!exchangeEligible(config,id,row))continue;

      const price=positive(
        row?.raw_price_usd ??
        row?.price_usd
      );

      if(Number.isFinite(price)){
        prices.push(price);
      }
    }

    if(prices.length){
      return prices.reduce(
        (sum,price)=>sum+price,
        0
      )/prices.length;
    }

    return positive(
      W.ZZXGlobalBPI?.bpi_unweighted_price_usd ??
      W.ZZXBitAvgLatest?.canonical_bpi_unweighted_usd
    );
  }

  function canonicalBpi(config){
    const latest=config?.latest;
    const mode=weightingMode();
    const unweighted=canonicalUnweighted(config);
    const weighted=positive(
      latest?.weighted_average?.price_usd ??
      latest?.weighted_average?.vwap_usd ??
      W.ZZXGlobalBPI?.bpi_weighted_price_usd ??
      W.ZZXBitAvgLatest?.canonical_bpi_weighted_usd ??
      latest?.price_usd ??
      latest?.bpi_usd
    );

    const p=
      mode==="bpi" && Number.isFinite(weighted)
        ? weighted
        : Number.isFinite(unweighted)
          ? unweighted
          : positive(
              latest?.price_usd ??
              latest?.btc_usd ??
              latest?.bpi_usd
            );

    if(!Number.isFinite(p))return null;

    const weightingApplied=mode==="bpi";

    return {
      sourceId:"bpi",
      sourceType:"bpi",
      label:weightingApplied?"BPI · weighted":"BPI · unweighted",
      priceUsd:p,
      highUsd:finite(latest?.high_24h),
      lowUsd:finite(latest?.low_24h),
      volumeBtc:finite(latest?.volume_24h_btc),
      timestamp:latest?.observed_at??latest?.updated_at??null,
      sourceTimestamp:latest?.source_updated_at??latest?.updated_at??null,
      mode:weightingApplied
        ? "bpi_24h_btc_volume_weighted"
        : "bpi_unweighted_arithmetic_mean",
      weightingMode:mode,
      weightingApplied,
      weightedPriceUsd:weighted,
      unweightedPriceUsd:unweighted
    };
  }

  function globalBpi(latest){
    const published=W.ZZXGlobalBPI;
    const mode=weightingMode();

    const weighted=positive(
      published?.weighted_price_usd ??
      latest?.global_bpi?.vwap_usd ??
      latest?.global_bpi?.price_usd ??
      latest?.vwap_usd
    );

    const unweighted=positive(
      published?.unweighted_price_usd ??
      W.ZZXBitAvgLatest?.unweighted_bpi_usd
    );

    const p=
      mode==="global-bpi" && Number.isFinite(weighted)
        ? weighted
        : Number.isFinite(unweighted)
          ? unweighted
          : positive(
              published?.price_usd ??
              latest?.global_bpi?.price_usd ??
              latest?.global_bpi_usd ??
              latest?.vwap_usd ??
              latest?.bpi_usd
            );

    if(!Number.isFinite(p))return null;

    const weightingApplied=mode==="global-bpi";

    return {
      sourceId:"global-bpi",
      sourceType:"global-bpi",
      label:weightingApplied
        ? "Global BPI · weighted"
        : "Global BPI · unweighted",
      priceUsd:p,
      highUsd:finite(latest?.global_bpi?.high_24h??latest?.high_24h),
      lowUsd:finite(latest?.global_bpi?.low_24h??latest?.low_24h),
      volumeBtc:finite(published?.volume_24h_btc??latest?.volume_24h_btc),
      timestamp:latest?.observed_at??published?.observed_at??published?.updated_at??latest?.global_bpi?.updated_at??latest?.updated_at??null,
      sourceTimestamp:latest?.source_updated_at??published?.updated_at??latest?.global_bpi?.updated_at??latest?.updated_at??null,
      mode:weightingApplied
        ? String(published?.method_weighted??"bitavg_global_24h_btc_volume_weighted")
        : String(published?.method_unweighted??"global_unweighted_arithmetic_mean"),
      weightingMode:mode,
      weightingApplied,
      weightedPriceUsd:weighted,
      unweightedPriceUsd:unweighted
    };
  }

  function exchangeQuote(latest,id,label,config){
    const row=latest?.exchanges?.[id];
    if(!row)return null;
    if(!exchangeEligible(config||{latest},id,row))return null;

    const p=positive(row.price_usd);
    if(!Number.isFinite(p))return null;

    return {
      sourceId:`exchange:${id}`,
      exchangeId:id,
      sourceType:"exchange",
      label:String(row?.label||label||id),
      priceUsd:p,
      highUsd:finite(row?.high_24h),
      lowUsd:finite(row?.low_24h),
      volumeBtc:finite(row?.volume_24h_btc),
      timestamp:latest?.observed_at??row?.updated_at??latest?.updated_at??null,
      sourceTimestamp:row?.updated_at??latest?.source_updated_at??latest?.updated_at??null,
      mode:String(row?.mode||"exchange")
    };
  }

  function resolve(config,sourceId){
    const id=String(sourceId||"bpi");

    if(id==="bpi")return canonicalBpi(config);
    if(id==="global-bpi")return globalBpi(config.latest);

    if(id.startsWith("exchange:")){
      const ex=id.slice("exchange:".length);
      return exchangeQuote(config.latest,ex,exchangeMap(config).get(ex)?.label,config);
    }

    return canonicalBpi(config);
  }

  function publish(selection){
    const value=Object.freeze({...selection,selected_at:Date.now()});
    W.ZZXBPISelection=value;
    W.ZZXSelectedBPI=value;

    try{
      if(W.ZZXBPIRegistry?.setSelected)W.ZZXBPIRegistry.setSelected(value);
      else if(W.ZZXBPIRegistry?.select)W.ZZXBPIRegistry.select(value);
    }catch(_){}

    try{
      W.dispatchEvent(new CustomEvent("zzx:bpi-selection",{detail:value}));
    }catch(_){}

    return value;
  }

  W.ZZXBitcoinTickerSelection=Object.freeze({
    __version:8,
    weightingMode,
    canonicalUnweighted,
    exchangeMap,
    exchangeEligible,
    localConsensus,
    resolve,
    publish
  });
})();
