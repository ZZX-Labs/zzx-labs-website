(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolProvider?.__version>=5)return;

  function normalizeBase(value){return String(value||"").trim().replace(/\/+$/g,"");}
  function bases(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }
  async function getJSON(url,local=false){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{cacheBust:local,timeoutMs:10000,retries:1});
    }
    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,cache:"no-store",credentials:local?"same-origin":"omit",
        timeoutMs:10000,retries:1,retryDelayMs:450
      });
      return await r.json();
    }
    const r=await fetch(url,{cache:"no-store",credentials:local?"same-origin":"omit"});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }
  function positive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:NaN;}
  function parseMs(value){
    if(value==null)return NaN;
    const n=Number(value);
    if(Number.isFinite(n))return n<2e12?n*1000:n;
    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:NaN;
  }
  function marketStatePrice(){
    const state=W.ZZXMarketState;
    for(const value of [
      state?.effectivePriceUsd,state?.effective_price_usd,
      state?.snapshot?.effectivePriceUsd,state?.snapshot?.effective_price_usd,
      state?.current?.effectivePriceUsd,state?.current?.effective_price_usd
    ]){
      const price=positive(value);
      if(Number.isFinite(price))return {value:price,source:"ZZX Market State",mode:String(state?.weightedEnabled??state?.snapshot?.weightedEnabled??"")};
    }
    return null;
  }
  function legacySharedPrice(){
    try{
      const selected=typeof W.ZZXSelectedPriceUsd==="function"?W.ZZXSelectedPriceUsd():W.ZZXSelectedPriceUsd;
      const price=positive(selected);
      if(Number.isFinite(price))return {value:price,source:"ZZX selected BTC price",mode:"shared"};
    }catch(_){}
    try{
      if(typeof W.ZZXFX?.btcPriceUsd==="function"){
        const price=positive(W.ZZXFX.btcPriceUsd());
        if(Number.isFinite(price))return {value:price,source:"ZZX FX shared price",mode:"shared"};
      }
    }catch(_){}
    return null;
  }
  async function price(){
    const shared=marketStatePrice()||legacySharedPrice();
    if(shared)return shared;
    const raw="/bitcoin/bpi/api/latest.json";
    const url=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    try{
      const data=await getJSON(url,true);
      return {
        value:positive(data?.price_usd??data?.bpi_usd??data?.vwap_usd),
        source:data?.source||"ZZX Global BPI",mode:"fallback"
      };
    }catch(_){return {value:NaN,source:"price unavailable",mode:"unavailable"};}
  }
  async function resident(){
    const raw="/bitcoin/live/api/mempool.json";
    const url=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    const data=await getJSON(url,true);
    const observedAt=parseMs(data?.observed_at);
    if(!Number.isFinite(observedAt)||Date.now()-observedAt>15000){
      throw new Error("resident mempool snapshot is stale");
    }
    const spot=await price();
    return {
      summary:data?.summary||{},
      feeRecommendations:data?.fee_recommendations||null,
      candidateBlocks:Array.isArray(data?.candidate_blocks)?data.candidate_blocks:[],
      candidateSource:String(data?.source||"ZZX resident mempool telemetry"),
      priceUsd:spot.value,priceSource:spot.source,priceMode:spot.mode,
      source:String(data?.source||"ZZX resident mempool telemetry"),
      fetchedAt:observedAt,
      checkedAt:Date.now(),
      observedAt,
      sourceUpdatedAt:parseMs(data?.source_updated_at),
      transport:"resident"
    };
  }
  async function direct(core){
    let lastError=null;
    for(const base of bases(core)){
      try{
        const [summaryR,feesR,candidatesR,spot]=await Promise.all([
          getJSON(`${base}/mempool`,false),
          getJSON(`${base}/v1/fees/recommended`,false).catch(()=>null),
          getJSON(`${base}/v1/fees/mempool-blocks`,false).catch(()=>[]),
          price()
        ]);
        const now=Date.now();
        return {
          summary:summaryR,feeRecommendations:feesR,
          candidateBlocks:Array.isArray(candidatesR)?candidatesR:[],
          candidateSource:`${base}/v1/fees/mempool-blocks`,
          priceUsd:spot.value,priceSource:spot.source,priceMode:spot.mode,
          source:`${base}/mempool`,fetchedAt:now,checkedAt:now,observedAt:now,
          sourceUpdatedAt:NaN,transport:"direct-fallback"
        };
      }catch(error){lastError=error;}
    }
    throw lastError||new Error("mempool summary unavailable");
  }
  async function load(core){
    try{return await resident();}catch(_){return await direct(core);}
  }

  W.ZZXMempoolProvider=Object.freeze({
    __version:5,bases,marketStatePrice,legacySharedPrice,load
  });
})();
