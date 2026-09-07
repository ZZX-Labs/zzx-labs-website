(function(){
  "use strict";
  const W=window;
  if(W.ZZXCurrencyConverterData?.__version>=3)return;

  const STATIC_TTL_MS=30000;

  const CACHE={
    staticData:null,
    at:0
  };

  const ENDPOINTS=Object.freeze({
    currencies:"/bitcoin/bpi/api/currencies.json",
    symbols:"/bitcoin/bpi/api/symbols.json",
    rates:"/bitcoin/bpi/api/exchange_rates.json",
    referenceCatalog:"/__partials/widgets/bitcoin-ticker/reference-catalog.json",
    references:"/bitcoin/bpi/api/reference_prices.json",
    commodities:"/bitcoin/bpi/api/commodities.json",
    latest:"/bitcoin/bpi/api/latest.json"
  });

  const BTC_UNITS=Object.freeze([
    {
      id:"btc:kbtc",
      code:"kBTC",
      name:"kilobitcoin",
      unit:"kBTC",
      btcFactor:1000,
      selectable:true
    },
    {
      id:"btc:btc",
      code:"BTC",
      name:"bitcoin",
      unit:"BTC",
      btcFactor:1,
      selectable:true
    },
    {
      id:"btc:mbtc",
      code:"mBTC",
      name:"millibitcoin",
      unit:"mBTC",
      btcFactor:1e-3,
      selectable:true
    },
    {
      id:"btc:ubtc",
      code:"μBTC",
      name:"microbitcoin",
      unit:"μBTC",
      btcFactor:1e-6,
      selectable:true
    },
    {
      id:"btc:nbtc",
      code:"nBTC",
      name:"nanobitcoin",
      unit:"nBTC",
      btcFactor:1e-9,
      selectable:true
    },
    {
      id:"btc:sat",
      code:"sat",
      name:"satoshi",
      unit:"sat",
      btcFactor:1e-8,
      selectable:true
    },
    {
      id:"btc:msat",
      code:"msat",
      name:"millisatoshi",
      unit:"msat",
      btcFactor:1e-11,
      selectable:true
    },
    {
      id:"btc:usat",
      code:"μsat",
      name:"microsatoshi · display only",
      unit:"μsat",
      btcFactor:1e-14,
      selectable:false
    }
  ]);

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  };

  const positive=value=>{
    const n=finite(value);
    return n>0?n:NaN;
  };

  function resolved(path){
    return W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;
  }

  async function json(path,optional=false){
    try{
      const target=resolved(path);

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
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return await response.json();
    }catch(error){
      if(optional)return null;
      throw error;
    }
  }

  function sourceTimestamp(value){
    const ms=new Date(value||"").getTime();
    return Number.isFinite(ms)?ms:NaN;
  }

  function currentTickerPrice(latest){
    const selection=
      W.ZZXBPISelection||
      W.ZZXSelectedBPI;

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
        sourceType:String(
          selection?.sourceType||
          "ticker-selection"
        ),
        timestamp:
          selection?.timestamp||
          selection?.updated_at||
          null,
        live:true
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
        sourceType:"bpi",
        timestamp:live?.updated_at||null,
        live:true
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
        sourceType:"global-bpi",
        timestamp:
          W.ZZXGlobalBPI?.updated_at||
          null,
        live:true
      };
    }

    const price=positive(
      latest?.price_usd ??
      latest?.bpi_usd ??
      latest?.global_bpi?.price_usd
    );

    if(!Number.isFinite(price)){
      throw new Error(
        "BTC/USD unavailable"
      );
    }

    return {
      priceUsd:price,
      label:"ZZX BPI",
      sourceId:"local-bpi",
      sourceType:"bpi",
      timestamp:latest?.updated_at||null,
      live:false
    };
  }

  function providerLabel(rates){
    if(W.ZZXFX?.providerLabel){
      return W.ZZXFX.providerLabel(rates);
    }

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
      return Object.keys(providers).join(" + ");
    }

    return String(
      rates?.provider||
      rates?.source||
      "ZZX local FX mirror"
    );
  }

  function normalizeCurrencyMetadata(currencies,symbols){
    const rows=Array.isArray(currencies?.currencies)
      ? currencies.currencies
      : [];

    const byCode=new Map();

    for(const row of rows){
      const code=String(
        row?.code||""
      ).toUpperCase();

      if(/^[A-Z]{3}$/.test(code)){
        byCode.set(code,row);
      }
    }

    const names={
      ...(currencies?.names||{})
    };

    const symbolSource=
      symbols?.symbols &&
      typeof symbols.symbols==="object"
        ? symbols.symbols
        : symbols||{};

    const symbolMap={
      ...(currencies?.symbols||{}),
      ...(symbolSource||{})
    };

    for(const [code,row] of byCode){
      if(!names[code]&&row?.name){
        names[code]=String(row.name);
      }

      if(!symbolMap[code]&&row?.symbol){
        symbolMap[code]=String(row.symbol);
      }
    }

    let order=Array.isArray(currencies?.order)
      ? currencies.order.map(
          code=>String(code||"").toUpperCase()
        )
      : [...byCode.keys()];

    order=order.filter(
      (code,index)=>
        /^[A-Z]{3}$/.test(code) &&
        order.indexOf(code)===index
    );

    for(const code of byCode.keys()){
      if(!order.includes(code)){
        order.push(code);
      }
    }

    if(!order.includes("USD")){
      order.unshift("USD");
    }

    return {
      order,
      names,
      symbols:symbolMap,
      rows:byCode
    };
  }

  function currencyRows(currencies,symbols,rates){
    const metadata=normalizeCurrencyMetadata(
      currencies,
      symbols
    );

    const rateSource=rates?.rates||{};
    const source=providerLabel(rates);
    const out=[];

    for(const code of metadata.order){
      const perUsd=
        code==="USD"
          ? 1
          : positive(rateSource?.[code]);

      const available=Number.isFinite(perUsd);

      out.push({
        id:`fiat:${code}`,
        kind:"fiat",
        code,
        name:String(
          metadata.names?.[code]||
          metadata.rows.get(code)?.name||
          code
        ),
        symbol:String(
          metadata.symbols?.[code]||
          metadata.rows.get(code)?.symbol||
          ""
        ),
        unit:code,
        usdPerUnit:
          available
            ? 1/perUsd
            : NaN,
        unitsPerUsd:
          available
            ? perUsd
            : NaN,
        available,
        selectable:available,
        source,
        updatedAt:rates?.updated_at||null
      });
    }

    return out;
  }

  function pageMap(catalog){
    const map=new Map();

    for(const page of catalog?.pages||[]){
      if(page?.id){
        map.set(
          String(page.id),
          {
            id:String(page.id),
            label:String(
              page.label||page.id
            ),
            description:String(
              page.description||""
            ),
            order:Number(page.order||0)
          }
        );
      }
    }

    return map;
  }

  function referenceRows(catalog,references,commodities){
    const priceMap=new Map();

    const put=(id,usd,source,updatedAt)=>{
      const value=positive(usd);

      if(value>0&&!priceMap.has(id)){
        priceMap.set(id,{
          usd:value,
          source:String(
            source||
            "ZZX reference feed"
          ),
          updatedAt:updatedAt||null
        });
      }
    };

    const refs=
      references?.prices||
      references?.references||
      {};

    if(
      refs &&
      typeof refs==="object"
    ){
      for(const [id,row] of Object.entries(refs)){
        if(typeof row==="number"){
          put(
            id,
            row,
            references?.source,
            references?.updated_at
          );
        }else if(
          row &&
          typeof row==="object"
        ){
          put(
            id,
            row.usd ??
            row.price_usd ??
            row.value_usd ??
            row.price,
            row.source ??
            row.provider ??
            references?.source,
            row.updated_at ??
            references?.updated_at
          );
        }
      }
    }

    const cp=
      commodities?.prices||
      commodities?.commodities||
      {};

    if(
      cp &&
      typeof cp==="object"
    ){
      const aliases={
        gold:[
          "gold_usd_oz",
          "gold",
          "XAU"
        ],
        silver:[
          "silver_usd_oz",
          "silver",
          "XAG"
        ],
        platinum:[
          "platinum_usd_oz",
          "platinum",
          "XPT"
        ],
        palladium:[
          "palladium_usd_oz",
          "palladium",
          "XPD"
        ],
        copper:[
          "copper_usd_lb",
          "copper"
        ],
        oil:[
          "oil_usd_barrel",
          "wti_usd_barrel",
          "crude_usd_barrel",
          "oil"
        ]
      };

      for(const [id,keys] of Object.entries(aliases)){
        for(const key of keys){
          const value=positive(cp?.[key]);

          if(Number.isFinite(value)){
            put(
              id,
              value,
              commodities?.sources?.[id]||
              commodities?.source||
              "ZZX commodities",
              commodities?.updated_at
            );
            break;
          }
        }
      }
    }

    const pages=pageMap(catalog);
    const out=[];

    for(const item of catalog?.items||[]){
      const id=String(item?.id||"");
      if(!id)continue;

      const price=priceMap.get(id);
      const page=pages.get(
        String(
          item.page||
          item.category||
          "references"
        )
      );

      out.push({
        id:`ref:${id}`,
        kind:"reference",
        code:id,
        name:String(
          item.name||id
        ),
        category:
          page?.label||
          String(
            item.category||
            "References"
          ),
        pageId:
          page?.id||
          String(
            item.page||
            "references"
          ),
        pageOrder:
          page?.order??999,
        unit:String(
          item.unit||"unit"
        ),
        usdPerUnit:
          price?.usd??NaN,
        unitsPerUsd:
          price?.usd>0
            ? 1/price.usd
            : NaN,
        available:!!price,
        selectable:!!price,
        source:
          price?.source||
          "reference unavailable",
        updatedAt:
          price?.updatedAt||
          null,
        tags:Array.isArray(item.tags)
          ? item.tags
          : [],
        restrictedReference:
          item.restricted_reference===true
      });
    }

    return out;
  }

  async function loadStatic(force=false){
    const now=Date.now();

    if(
      !force &&
      CACHE.staticData &&
      now-CACHE.at<STATIC_TTL_MS
    ){
      return CACHE.staticData;
    }

    const [
      currencies,
      symbols,
      rates,
      catalog,
      references,
      commodities
    ]=await Promise.all([
      json(ENDPOINTS.currencies),
      json(ENDPOINTS.symbols,true),
      json(ENDPOINTS.rates),
      json(ENDPOINTS.referenceCatalog,true),
      json(ENDPOINTS.references,true),
      json(ENDPOINTS.commodities,true)
    ]);

    CACHE.staticData={
      currencies,
      symbols,
      rates,
      catalog,
      references,
      commodities
    };
    CACHE.at=now;

    return CACHE.staticData;
  }

  async function load(force=false){
    const staticData=await loadStatic(force);

    let latest=null;
    try{
      latest=await json(
        ENDPOINTS.latest,
        true
      );
    }catch(_){}

    const {
      currencies,
      symbols,
      rates,
      catalog,
      references,
      commodities
    }=staticData;

    const ticker=currentTickerPrice(latest||{});

    const bitcoin=BTC_UNITS.map(row=>({
      ...row,
      kind:"bitcoin",
      usdPerUnit:
        ticker.priceUsd*row.btcFactor,
      unitsPerUsd:
        1/(ticker.priceUsd*row.btcFactor),
      available:true,
      source:ticker.label,
      updatedAt:ticker.timestamp
    }));

    const fiat=currencyRows(
      currencies||{},
      symbols||{},
      rates||{}
    );

    const refs=referenceRows(
      catalog||{items:[]},
      references||{},
      commodities||{}
    );

    const assets=[
      ...fiat,
      ...bitcoin,
      ...refs
    ];

    const byId=new Map(
      assets.map(row=>[row.id,row])
    );

    return {
      assets,
      byId,
      fiat,
      bitcoin,
      references:refs,
      referencePages:[...new Map(
        refs.map(row=>[
          row.pageId,
          {
            id:row.pageId,
            label:row.category,
            order:row.pageOrder
          }
        ])
      ).values()].sort(
        (a,b)=>a.order-b.order
      ),
      ticker,
      ratesUpdatedAt:
        rates?.updated_at||
        null,
      referenceUpdatedAt:
        references?.updated_at||
        commodities?.updated_at||
        null,
      currencyCount:fiat.length,
      availableCurrencyCount:
        fiat.filter(row=>row.available).length,
      referenceCount:refs.length,
      availableReferenceCount:
        refs.filter(row=>row.available).length,
      fxProvider:
        providerLabel(rates),
      fxConvention:
        rates?.convention||
        "1 USD = rates[CODE] CODE"
    };
  }

  W.ZZXCurrencyConverterData=Object.freeze({
    __version:3,
    endpoints:ENDPOINTS,
    btcUnits:BTC_UNITS,
    load,
    currentTickerPrice,
    normalizeCurrencyMetadata,
    currencyRows,
    referenceRows
  });
})();
