// __partials/widgets/mempool/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolProvider?.__version>=4)return;

  function normalizeBase(value){
    return String(value||"").trim().replace(/\/+$/g,"");
  }

  function bases(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  async function getJSON(url,local=false){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:10000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:local?"same-origin":"omit"
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }

  async function summary(core){
    let lastError=null;

    for(const base of bases(core)){
      try{
        const data=await getJSON(`${base}/mempool`,false);
        return {
          data,
          source:`${base}/mempool`,
          base
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("mempool summary unavailable");
  }

  async function recommendations(base){
    try{
      return await getJSON(`${base}/v1/fees/recommended`,false);
    }catch(_error){
      return null;
    }
  }

  async function candidateBlocks(base){
    try{
      const data=await getJSON(`${base}/v1/fees/mempool-blocks`,false);
      return {
        data:Array.isArray(data)?data:[],
        source:`${base}/v1/fees/mempool-blocks`
      };
    }catch(_error){
      return {
        data:[],
        source:"candidate blocks unavailable"
      };
    }
  }

  function positive(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>0?n:NaN;
  }

  function marketStatePrice(){
    const state=W.ZZXMarketState;

    const candidates=[
      state?.effectivePriceUsd,
      state?.effective_price_usd,
      state?.snapshot?.effectivePriceUsd,
      state?.snapshot?.effective_price_usd,
      state?.current?.effectivePriceUsd,
      state?.current?.effective_price_usd
    ];

    for(const value of candidates){
      const price=positive(value);
      if(Number.isFinite(price)){
        return {
          value:price,
          source:"ZZX Market State",
          mode:String(
            state?.weightedEnabled ??
            state?.snapshot?.weightedEnabled ??
            ""
          )
        };
      }
    }

    return null;
  }

  function legacySharedPrice(){
    try{
      const selected=typeof W.ZZXSelectedPriceUsd==="function"
        ? W.ZZXSelectedPriceUsd()
        : W.ZZXSelectedPriceUsd;

      const selectedPrice=positive(selected);
      if(Number.isFinite(selectedPrice)){
        return {
          value:selectedPrice,
          source:"ZZX selected BTC price",
          mode:"shared"
        };
      }
    }catch(_error){}

    try{
      if(typeof W.ZZXFX?.btcPriceUsd==="function"){
        const fxPrice=positive(W.ZZXFX.btcPriceUsd());
        if(Number.isFinite(fxPrice)){
          return {
            value:fxPrice,
            source:"ZZX FX shared price",
            mode:"shared"
          };
        }
      }
    }catch(_error){}

    return null;
  }

  async function price(){
    const shared=marketStatePrice()||legacySharedPrice();
    if(shared)return shared;

    const url="/bitcoin/bpi/api/latest.json";

    try{
      const data=await getJSON(
        W.ZZXAPI?.url ? W.ZZXAPI.url(url) : url,
        true
      );

      const value=positive(
        data?.price_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );

      return {
        value,
        source:data?.source||"ZZX Global BPI",
        mode:"fallback"
      };
    }catch(_error){
      return {
        value:NaN,
        source:"price unavailable",
        mode:"unavailable"
      };
    }
  }

  async function load(core){
    const s=await summary(core);

    const [fees,spot,candidates]=await Promise.all([
      recommendations(s.base),
      price(),
      candidateBlocks(s.base)
    ]);

    return {
      summary:s.data,
      feeRecommendations:fees,
      candidateBlocks:candidates.data,
      candidateSource:candidates.source,
      priceUsd:spot.value,
      priceSource:spot.source,
      priceMode:spot.mode,
      source:s.source,
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolProvider=Object.freeze({
    __version:4,
    bases,
    marketStatePrice,
    legacySharedPrice,
    load
  });
})();
