(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerSelection?.__version>=6)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};

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

  function canonicalBpi(latest){
    const p=positive(
      latest?.price_usd ??
      latest?.btc_usd ??
      latest?.bpi_usd ??
      latest?.weighted_average?.price_usd
    );
    if(!Number.isFinite(p))return null;

    return {
      sourceId:"bpi",
      sourceType:"bpi",
      label:"BPI",
      priceUsd:p,
      highUsd:finite(latest?.high_24h),
      lowUsd:finite(latest?.low_24h),
      volumeBtc:finite(latest?.volume_24h_btc),
      timestamp:latest?.updated_at||null,
      mode:String(latest?.mode||"bpi")
    };
  }

  function globalBpi(latest){
    const published=W.ZZXGlobalBPI;
    const p=positive(
      published?.price_usd ??
      latest?.global_bpi?.price_usd ??
      latest?.global_bpi_usd ??
      latest?.vwap_usd ??
      latest?.bpi_usd
    );
    if(!Number.isFinite(p))return null;

    return {
      sourceId:"global-bpi",
      sourceType:"global-bpi",
      label:"Global BPI",
      priceUsd:p,
      highUsd:finite(latest?.global_bpi?.high_24h??latest?.high_24h),
      lowUsd:finite(latest?.global_bpi?.low_24h??latest?.low_24h),
      volumeBtc:finite(published?.volume_24h_btc??latest?.volume_24h_btc),
      timestamp:published?.updated_at??latest?.global_bpi?.updated_at??latest?.updated_at??null,
      mode:String(published?.method??latest?.global_bpi?.method??"bitavg-global-bpi")
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
      timestamp:row?.updated_at??latest?.updated_at??null,
      mode:String(row?.mode||"exchange")
    };
  }

  function resolve(config,sourceId){
    const id=String(sourceId||"bpi");

    if(id==="bpi")return canonicalBpi(config.latest);
    if(id==="global-bpi")return globalBpi(config.latest);

    if(id.startsWith("exchange:")){
      const ex=id.slice("exchange:".length);
      return exchangeQuote(config.latest,ex,exchangeMap(config).get(ex)?.label,config);
    }

    return canonicalBpi(config.latest);
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
    __version:6,
    exchangeMap,
    exchangeEligible,
    localConsensus,
    resolve,
    publish
  });
})();
