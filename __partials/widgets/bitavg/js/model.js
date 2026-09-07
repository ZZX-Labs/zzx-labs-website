(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgModel?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const text=v=>String(v??"").trim();
  const upper=v=>text(v).toUpperCase();

  function exchangeLabels(config){
    const map=new Map();
    const add=(key,label)=>{
      const k=text(key);
      if(k)map.set(k,text(label)||k);
    };

    const list=Array.isArray(config)
      ? config
      : Array.isArray(config?.exchanges)
        ? config.exchanges
        : Array.isArray(config?.data)
          ? config.data
          : null;

    if(list){
      for(const row of list){
        if(typeof row==="string")add(row,row);
        else add(row?.id??row?.source??row?.key??row?.slug,row?.label??row?.name);
      }
    }

    const obj=config?.exchanges;
    if(obj&&typeof obj==="object"&&!Array.isArray(obj)){
      for(const [key,row] of Object.entries(obj)){
        if(typeof row==="string")add(key,row);
        else add(key,row?.label??row?.name??key);
      }
    }

    return map;
  }

  function configuredExchangeIds(config){
    return new Set(exchangeLabels(config).keys());
  }

  function parsePair(symbol,fiats){
    const raw=upper(symbol);
    if(!raw)return {base:"",quote:""};

    const parts=raw.split(/[\/:_-]/).filter(Boolean);
    if(parts.length>=2){
      return {base:parts[0],quote:parts[1]};
    }

    for(const base of ["BTC","XBT"]){
      if(raw.startsWith(base)){
        const q=raw.slice(base.length);
        if(fiats.has(q))return {base,quote:q};
      }
      if(raw.endsWith(base)){
        const q=raw.slice(0,-base.length);
        if(fiats.has(q))return {base,quote:q};
      }
    }

    return {base:"",quote:""};
  }

  function marketFromRow(row,parentExchange,fiats,rates,labels,priority,sourceName){
    if(!row||typeof row!=="object")return null;

    let exchange=text(
      row.exchange ??
      row.exchange_id ??
      row.venue ??
      row.provider ??
      row.source ??
      parentExchange
    );

    if(!exchange)exchange=text(parentExchange)||"exchange";

    const symbol=text(
      row.symbol ??
      row.pair ??
      row.product_id ??
      row.market ??
      row.instrument
    );

    const parsed=parsePair(symbol,fiats);

    let base=upper(
      row.base ??
      row.base_currency ??
      row.baseAsset ??
      row.base_asset ??
      parsed.base
    );

    let quote=upper(
      row.quote ??
      row.quote_currency ??
      row.quoteAsset ??
      row.quote_asset ??
      row.currency ??
      row.fiat ??
      parsed.quote
    );

    if(base==="XBT")base="BTC";

    if(!base&&quote&&(
      row.price!=null||
      row.last!=null||
      row.price_native!=null
    )){
      base="BTC";
    }

    if(base!=="BTC"||!fiats.has(quote))return null;

    const nativePrice=finite(
      row.native_price ??
      row.price_native ??
      row.price ??
      row.last ??
      row.last_price ??
      row.close
    );

    const directUsd=finite(
      row.price_usd ??
      row.usd_price ??
      row.normalized_price_usd
    );

    const usdPrice=
      directUsd>0
        ? directUsd
        : W.ZZXBitAvgFX.toUsd(nativePrice,quote,rates);

    if(!(usdPrice>0))return null;

    const native=
      nativePrice>0
        ? nativePrice
        : quote==="USD"
          ? usdPrice
          : NaN;

    let volumeBtc=finite(
      row.volume_24h_btc ??
      row.volume_btc ??
      row.base_volume_24h ??
      row.base_volume ??
      row.volume_base
    );

    if(!(volumeBtc>=0)){
      const generic=finite(row.volume_24h ?? row.volume);
      if(generic>=0)volumeBtc=generic;
    }

    if(!(volumeBtc>=0)){
      const quoteVolume=finite(
        row.quote_volume_24h ??
        row.quote_volume ??
        row.volume_quote
      );
      if(quoteVolume>=0&&native>0)volumeBtc=quoteVolume/native;
    }

    const providedWeight=finite(row.weight);

    const label=
      labels.get(exchange) ??
      text(row.exchange_label??row.label) ??
      exchange;

    const pair=symbol||`BTC/${quote}`;

    return {
      exchange,
      label,
      base:"BTC",
      quote,
      pair,
      nativePrice:native,
      usdPrice,
      volumeBtc:volumeBtc>=0?volumeBtc:NaN,
      providedWeight:providedWeight>=0?providedWeight:NaN,
      source:sourceName,
      priority
    };
  }

  function collectContainer(container,parentExchange,fiats,rates,labels,priority,sourceName,out){
    if(!container)return;

    if(Array.isArray(container)){
      for(const row of container){
        const market=marketFromRow(row,parentExchange,fiats,rates,labels,priority,sourceName);
        if(market)out.push(market);
      }
      return;
    }

    if(typeof container!=="object")return;

    for(const [key,value] of Object.entries(container)){
      if(Array.isArray(value)){
        collectContainer(value,key,fiats,rates,labels,priority,sourceName,out);
        continue;
      }

      if(value&&typeof value==="object"){
        const nested=
          value.markets ??
          value.pairs ??
          value.quotes ??
          value.tickers ??
          value.products;

        if(nested){
          collectContainer(nested,key,fiats,rates,labels,priority,sourceName,out);
        }

        const direct=marketFromRow(value,key,fiats,rates,labels,priority,sourceName);
        if(direct)out.push(direct);
      }
    }
  }

  function collectMarkets(payload,fiats,rates,labels,priority,sourceName){
    const out=[];
    if(!payload)return out;

    const roots=[
      payload?.markets,
      payload?.data?.markets,
      payload?.pairs,
      payload?.data?.pairs,
      payload?.rows
    ];

    for(const root of roots){
      if(root)collectContainer(root,"",fiats,rates,labels,priority,sourceName,out);
    }

    const exchanges=payload?.exchanges;
    if(exchanges)collectContainer(exchanges,"",fiats,rates,labels,priority,sourceName,out);

    if(Array.isArray(payload)){
      collectContainer(payload,"",fiats,rates,labels,priority,sourceName,out);
    }

    return out;
  }

  function compatibilityMarkets(latest,fiats,rates,labels){
    const out=[];
    const exchanges=latest?.exchanges;
    if(!exchanges||typeof exchanges!=="object")return out;

    for(const [key,row] of Object.entries(exchanges)){
      if(!row||typeof row!=="object")continue;

      const quote=upper(row.quote_currency??row.currency??"USD");
      const pseudo={
        ...row,
        exchange:key,
        base:"BTC",
        quote:fiats.has(quote)?quote:"USD",
        symbol:`BTC/${fiats.has(quote)?quote:"USD"}`,
        native_price:
          finite(row.price_native)>0
            ? row.price_native
            : quote==="USD"
              ? row.price_usd
              : row.price,
        price_usd:row.price_usd,
        volume_24h_btc:row.volume_24h_btc
      };

      const market=marketFromRow(
        pseudo,key,fiats,rates,labels,20,"latest compatibility row"
      );

      if(market)out.push(market);
    }

    return out;
  }

  function dedupe(markets){
    const map=new Map();

    for(const row of markets){
      const key=[
        row.exchange,
        row.pair||`${row.base}/${row.quote}`,
        row.quote
      ].join("|").toLowerCase();

      const current=map.get(key);

      if(
        !current ||
        row.priority<current.priority ||
        (
          row.priority===current.priority &&
          Number.isFinite(row.volumeBtc) &&
          !Number.isFinite(current.volumeBtc)
        )
      ){
        map.set(key,row);
      }
    }

    return [...map.values()];
  }

  function build({latest,markets,exchangeRates,currencies,exchangeConfig}){
    const fiats=W.ZZXBitAvgFX.fiatCodes(currencies);
    const rates=W.ZZXBitAvgFX.ratesPerUsd(exchangeRates);

    // Every FX currency actually present in the rates feed is also eligible fiat.
    for(const code of rates.keys())fiats.add(code);

    const labels=exchangeLabels(exchangeConfig);

    let rows=dedupe([
      ...collectMarkets(markets,fiats,rates,labels,0,"markets.json"),
      ...collectMarkets(latest,fiats,rates,labels,10,"latest.json"),
      ...collectMarkets(exchangeConfig,fiats,rates,labels,15,"exchanges.json")
    ]);

    if(!rows.length){
      rows=dedupe(compatibilityMarkets(latest,fiats,rates,labels));
    }

    if(!rows.length)throw new Error("no BTC/fiat markets found");

    const volumeRows=rows.filter(row=>Number.isFinite(row.volumeBtc)&&row.volumeBtc>0);
    const totalVolume=volumeRows.reduce((sum,row)=>sum+row.volumeBtc,0);

    let bpi=NaN;
    let method="";

    if(totalVolume>0){
      bpi=volumeRows.reduce((sum,row)=>sum+row.usdPrice*row.volumeBtc,0)/totalVolume;
      method="volume_weighted_all_btc_fiat_markets";
      for(const row of rows){
        row.weight=Number.isFinite(row.volumeBtc)&&row.volumeBtc>0
          ? row.volumeBtc/totalVolume
          : 0;
      }
    }else{
      const weighted=rows.filter(row=>Number.isFinite(row.providedWeight)&&row.providedWeight>0);
      const sum=weighted.reduce((s,row)=>s+row.providedWeight,0);

      if(sum<=0)throw new Error("BTC/fiat markets found but no usable 24h BTC volume");

      bpi=weighted.reduce((s,row)=>s+row.usdPrice*row.providedWeight,0)/sum;
      method="compatibility_weighted_normalized_markets";

      for(const row of rows){
        row.weight=Number.isFinite(row.providedWeight)&&row.providedWeight>0
          ? row.providedWeight/sum
          : 0;
      }
    }

    for(const row of rows){
      row.deviationPct=((row.usdPrice-bpi)/bpi)*100;
    }

    rows.sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label)||a.quote.localeCompare(b.quote));

    const exchangeWeight=new Map();
    for(const row of rows){
      exchangeWeight.set(row.exchange,(exchangeWeight.get(row.exchange)||0)+row.weight);
    }

    const exchanges=[...new Set(rows.map(row=>row.exchange))];
    const currenciesUsed=[...new Set(rows.map(row=>row.quote))].sort();

    const topExchange=[...exchangeWeight.entries()]
      .sort((a,b)=>b[1]-a[1])[0]||null;

    const prices=rows.map(row=>row.usdPrice).filter(Number.isFinite);
    const high=prices.length?Math.max(...prices):NaN;
    const low=prices.length?Math.min(...prices):NaN;
    const spread=Number.isFinite(high)&&Number.isFinite(low)?high-low:NaN;
    const spreadPct=Number.isFinite(spread)?spread/bpi*100:NaN;

    const configured=configuredExchangeIds(exchangeConfig);

    const updatedAt=
      latest?.updated_at ??
      latest?.generated_at ??
      markets?.updated_at ??
      markets?.generated_at ??
      null;

    return {
      bpi,
      rows,
      exchanges,
      currencies:currenciesUsed,
      markets:rows.length,
      weightedMarkets:rows.filter(row=>row.weight>0).length,
      volume:totalVolume>0?totalVolume:NaN,
      spread,
      spreadPct,
      topExchange:topExchange
        ? {
            id:topExchange[0],
            label:labels.get(topExchange[0])||topExchange[0],
            weight:topExchange[1]
          }
        : null,
      weightSum:rows.reduce((sum,row)=>sum+row.weight,0),
      method,
      configuredCount:configured.size,
      configuredCovered:[...configured].filter(id=>exchanges.includes(id)).length,
      updatedAt,
      fxRateCount:rates.size,
      fiatCatalogCount:fiats.size,
      eligibility:"BTC_or_XBT_base_and_recognized_fiat_quote_only",
      weighting:"btc_24h_volume_decimal_ratio"
    };
  }

  W.ZZXBitAvgModel=Object.freeze({__version:5,build});
})();
