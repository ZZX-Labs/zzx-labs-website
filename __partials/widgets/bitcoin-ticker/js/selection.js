(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerSelection?.__version>=10)return;

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

      // Legacy boolean did not encode whether local BPI or Global BPI
      // was intended. Only an explicit modern scoped mode is authoritative.
      return "off";
    }catch(_){
      return "off";
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

  function nativeRegion(config){
    const policy=config?.indexPolicy||{};
    const stored=(()=>{
      try{return W.localStorage.getItem("zzx.bpi.native-region.v1")}catch(_){return null}
    })();
    const candidate=String(
      stored ||
      policy?.default_country ||
      policy?.native_bpi?.regions?.[0] ||
      "US"
    ).toUpperCase();
    return /^[A-Z]{2,8}$/.test(candidate)?candidate:"US";
  }

  function bpiWeightsEnabled(){
    return weightingMode()==="bpi";
  }

  function globalWeightsEnabled(){
    return weightingMode()==="global-bpi";
  }

  function weightsEnabled(){
    return bpiWeightsEnabled()||globalWeightsEnabled();
  }

  /*
   * Never rebuild the canonical BPI population in the browser.
   * The Python collector/index engine is authoritative because it owns:
   * exchange geography, policy eligibility, USD normalization, sanity gates,
   * and 24h BTC-volume weights.  Browser code only selects weighted vs
   * unweighted presentation.
   */
  function canonicalUnweighted(config){
    const latest=config?.latest||{};
    const region=nativeRegion(config);
    return positive(
      latest?.national_bpi?.[region]?.unweighted_price_usd ??
      latest?.weighted_average?.unweighted_price_usd
    );
  }

  function canonicalBpi(config){
    const latest=config?.latest||{};
    const region=nativeRegion(config);
    const native=latest?.national_bpi?.[region]||{};
    const weighted=positive(
      native?.weighted_price_usd ??
      latest?.weighted_average?.price_usd ??
      latest?.price_usd
    );
    const unweighted=positive(
      native?.unweighted_price_usd ??
      latest?.weighted_average?.unweighted_price_usd
    );
    const useWeighted=bpiWeightsEnabled();
    const p=useWeighted&&Number.isFinite(weighted)
      ? weighted
      : Number.isFinite(unweighted)
        ? unweighted
        : weighted;

    if(!Number.isFinite(p))return null;

    return {
      sourceId:"bpi",
      sourceType:"bpi",
      region,
      label:`BPI ${region} · ${useWeighted?"weighted":"unweighted"}`,
      priceUsd:p,
      highUsd:finite(native?.high_24h??latest?.high_24h),
      lowUsd:finite(native?.low_24h??latest?.low_24h),
      volumeBtc:finite(native?.volume_24h_btc??latest?.volume_24h_btc),
      timestamp:latest?.observed_at??latest?.updated_at??null,
      sourceTimestamp:latest?.source_updated_at??latest?.updated_at??null,
      mode:useWeighted
        ? "native_24h_btc_volume_weighted"
        : "native_unweighted_arithmetic_mean",
      weightingMode:weightingMode(),
      weightingApplied:useWeighted,
      weightedPriceUsd:weighted,
      unweightedPriceUsd:unweighted,
      exchangeCount:Number(native?.exchange_count||0),
      marketCount:Number(native?.market_count||0),
      exchangeIds:Array.isArray(native?.exchanges)?native.exchanges.slice():[]
    };
  }

  function globalBpi(latest){
    const published=W.ZZXGlobalBPI;
    const global=latest?.global_bpi||{};
    const weighted=positive(
      global?.weighted_price_usd ??
      global?.price_usd ??
      published?.weighted_price_usd
    );
    const unweighted=positive(
      global?.unweighted_price_usd ??
      published?.unweighted_price_usd
    );
    const useWeighted=globalWeightsEnabled();
    const p=useWeighted&&Number.isFinite(weighted)
      ? weighted
      : Number.isFinite(unweighted)
        ? unweighted
        : weighted;

    if(!Number.isFinite(p))return null;

    return {
      sourceId:"global-bpi",
      sourceType:"global-bpi",
      region:"GLOBAL",
      label:`Global BPI · ${useWeighted?"weighted":"unweighted"}`,
      priceUsd:p,
      highUsd:finite(global?.high_24h??latest?.high_24h),
      lowUsd:finite(global?.low_24h??latest?.low_24h),
      volumeBtc:finite(global?.volume_24h_btc??published?.volume_24h_btc),
      timestamp:latest?.observed_at??published?.observed_at??global?.updated_at??latest?.updated_at??null,
      sourceTimestamp:latest?.source_updated_at??published?.source_updated_at??global?.updated_at??latest?.updated_at??null,
      mode:useWeighted
        ? String(global?.method_weighted??published?.method_weighted??"global_24h_btc_volume_weighted")
        : String(global?.method_unweighted??published?.method_unweighted??"global_unweighted_arithmetic_mean"),
      weightingMode:weightingMode(),
      weightingApplied:useWeighted,
      weightedPriceUsd:weighted,
      unweightedPriceUsd:unweighted,
      exchangeCount:Number(global?.exchange_count||0),
      marketCount:Number(global?.market_count||0),
      exchangeIds:Array.isArray(global?.exchanges)?global.exchanges.slice():[]
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
    __version:10,
    weightingMode,
    nativeRegion,
    weightsEnabled,
    bpiWeightsEnabled,
    globalWeightsEnabled,
    canonicalUnweighted,
    exchangeMap,
    exchangeEligible,
    localConsensus,
    resolve,
    publish
  });
})();
