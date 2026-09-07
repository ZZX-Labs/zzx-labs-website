(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerSelection?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};

  function exchangeMap(config){
    const out=new Map();
    const e=config?.exchangesData;
    const sources=e?.sources;

    if(sources&&typeof sources==="object"){
      for(const [id,row] of Object.entries(sources)){
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

  function exchangeQuote(latest,id,label){
    const row=latest?.exchanges?.[id];
    if(!row)return null;

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
      return exchangeQuote(config.latest,ex,exchangeMap(config).get(ex)?.label);
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
    __version:5,exchangeMap,resolve,publish
  });
})();
