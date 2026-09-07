(function(){
  "use strict";
  const W=window;
  if(W.ZZXFX?.__version>=6)return;

  const cache={
    rates:null,
    currencies:null,
    latest:null,
    at:0
  };

  const TTL=30000;

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  };

  const positive=value=>{
    const n=finite(value);
    return n>0?n:NaN;
  };

  const url=path=>
    W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;

  async function json(path){
    const target=url(path);

    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(
        target,
        {
          cacheBust:true,
          timeoutMs:8000,
          retries:1
        }
      );
    }

    const response=await fetch(
      target,
      {cache:"no-store"}
    );

    if(!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  }

  async function load(force=false){
    if(
      !force &&
      cache.rates &&
      cache.currencies &&
      Date.now()-cache.at<TTL
    ){
      return cache;
    }

    const [rates,currencies,latest]=await Promise.all([
      json("/bitcoin/bpi/api/exchange_rates.json"),
      json("/bitcoin/bpi/api/currencies.json"),
      json("/bitcoin/bpi/api/latest.json")
    ]);

    cache.rates=rates;
    cache.currencies=currencies;
    cache.latest=latest;
    cache.at=Date.now();

    return cache;
  }

  function liveTickerPrice(){
    const selection=W.ZZXBPISelection||W.ZZXSelectedBPI;

    const selected=positive(
      selection?.priceUsd ??
      selection?.price_usd ??
      W.ZZXSelectedPriceUsd
    );

    if(Number.isFinite(selected)){
      return {
        priceUsd:selected,
        label:String(
          selection?.label||
          "Bitcoin Ticker"
        ),
        sourceId:String(
          selection?.sourceId||
          selection?.source_id||
          "ticker-selection"
        ),
        timestamp:
          selection?.timestamp||
          selection?.updated_at||
          null
      };
    }

    const live=W.ZZXLiveBPISnapshot;
    const livePrice=positive(
      live?.price_usd ??
      live?.bpi_usd
    );

    if(Number.isFinite(livePrice)){
      return {
        priceUsd:livePrice,
        label:"Live BPI",
        sourceId:"browser-live-bpi",
        timestamp:live?.updated_at||null
      };
    }

    const global=positive(
      W.ZZXGlobalBPI?.price_usd ??
      W.ZZXGlobalBPI?.priceUsd
    );

    if(Number.isFinite(global)){
      return {
        priceUsd:global,
        label:"Global BPI",
        sourceId:"global-bpi",
        timestamp:
          W.ZZXGlobalBPI?.updated_at||
          null
      };
    }

    return null;
  }

  async function btcQuote(force=false){
    const live=liveTickerPrice();
    if(live)return live;

    const data=await load(force);

    const price=positive(
      data.latest?.price_usd ??
      data.latest?.bpi_usd ??
      data.latest?.global_bpi?.price_usd
    );

    if(!Number.isFinite(price)){
      throw new Error("BTC/USD unavailable");
    }

    return {
      priceUsd:price,
      label:"ZZX BPI",
      sourceId:"local-bpi",
      timestamp:data.latest?.updated_at||null
    };
  }

  function normalizeCatalog(currencies,rates){
    const rawRows=Array.isArray(currencies?.currencies)
      ? currencies.currencies
      : [];

    const rowByCode=new Map();

    for(const row of rawRows){
      const code=String(row?.code||"").toUpperCase();
      if(/^[A-Z]{3}$/.test(code)){
        rowByCode.set(code,row);
      }
    }

    const order=Array.isArray(currencies?.order)
      ? currencies.order.map(
          code=>String(code||"").toUpperCase()
        )
      : [...rowByCode.keys()];

    const names={
      ...(currencies?.names||{})
    };

    const symbols={
      ...(currencies?.symbols||{})
    };

    for(const [code,row] of rowByCode){
      if(!names[code]&&row?.name){
        names[code]=String(row.name);
      }

      if(!symbols[code]&&row?.symbol){
        symbols[code]=String(row.symbol);
      }

      if(!order.includes(code)){
        order.push(code);
      }
    }

    const rateSource=rates?.rates||{};
    const available=order.filter(code=>{
      if(code==="USD")return true;
      return positive(rateSource?.[code])>0;
    });

    return {
      schema:"zzx-fx-catalog-v6",
      order,
      names,
      symbols,
      count:order.length,
      available,
      availableCount:available.length,
      default:String(
        currencies?.default||"USD"
      ).toUpperCase()
    };
  }

  async function catalog(force=false){
    const data=await load(force);
    return normalizeCatalog(
      data.currencies||{},
      data.rates||{}
    );
  }

  async function rate(code,force=false){
    const currency=String(
      code||"USD"
    ).toUpperCase();

    if(currency==="BTC"||currency==="XBT"){
      const quote=await btcQuote(force);

      return {
        rate:1/quote.priceUsd,
        provider:quote.label,
        updated_at:quote.timestamp,
        convention:"1 USD = rate BTC"
      };
    }

    const data=await load(force);
    const value=currency==="USD"
      ? 1
      : positive(
          data.rates?.rates?.[currency]
        );

    if(!(value>0)){
      throw new Error(
        `FX rate unavailable for ${currency}`
      );
    }

    return {
      rate:value,
      provider:
        providerLabel(data.rates)||
        "ZZX local FX mirror",
      updated_at:
        data.rates?.updated_at||
        null,
      convention:
        data.rates?.convention||
        "1 USD = rates[CODE] CODE"
    };
  }

  async function liveRate(code){
    return await rate(code,false);
  }

  function providerLabel(rates){
    const providers=rates?.providers;

    if(Array.isArray(providers)){
      return providers
        .map(row=>
          typeof row==="string"
            ? row
            : row?.name||row?.id
        )
        .filter(Boolean)
        .join(" + ");
    }

    if(
      providers &&
      typeof providers==="object"
    ){
      return Object.entries(providers)
        .filter(([,value])=>value!==false&&value!=null)
        .map(([key,value])=>{
          if(
            value &&
            typeof value==="object"
          ){
            return value.name||value.id||key;
          }
          return key;
        })
        .join(" + ");
    }

    return String(
      rates?.provider||
      rates?.source||
      ""
    );
  }

  async function usdPerUnit(code){
    const currency=String(code||"USD").toUpperCase();

    if(currency==="BTC"||currency==="XBT"){
      const quote=await btcQuote(false);
      return {
        usdPerUnit:quote.priceUsd,
        provider:quote.label,
        updated_at:quote.timestamp
      };
    }

    const fx=await rate(currency,false);

    return {
      usdPerUnit:1/fx.rate,
      provider:fx.provider,
      updated_at:fx.updated_at
    };
  }

  async function convertDetailed(value,from,to){
    const amount=finite(value);

    if(!Number.isFinite(amount)){
      throw new Error("Invalid conversion amount");
    }

    const [fromBasis,toBasis]=await Promise.all([
      usdPerUnit(from),
      usdPerUnit(to)
    ]);

    const usdValue=
      amount*fromBasis.usdPerUnit;

    const output=
      usdValue/toBasis.usdPerUnit;

    if(
      !Number.isFinite(usdValue) ||
      !Number.isFinite(output)
    ){
      throw new Error(
        "Non-finite conversion result"
      );
    }

    return {
      value:output,
      usdValue,
      from:String(from).toUpperCase(),
      to:String(to).toUpperCase(),
      amount,
      unitRate:
        fromBasis.usdPerUnit/
        toBasis.usdPerUnit,
      providers:[
        fromBasis.provider,
        toBasis.provider
      ].filter(Boolean),
      updated_at:[
        fromBasis.updated_at,
        toBasis.updated_at
      ].filter(Boolean).sort().at(-1)||null
    };
  }

  async function convert(value,from,to){
    const result=await convertDetailed(
      value,
      from,
      to
    );
    return result.value;
  }

  async function btcPriceUsd(){
    const quote=await btcQuote(false);
    return quote.priceUsd;
  }

  W.ZZXFX=Object.freeze({
    __version:6,
    load,
    rate,
    liveRate,
    convert,
    convertDetailed,
    catalog,
    btcPriceUsd,
    btcQuote,
    providerLabel
  });
})();
