// __partials/widgets/mempool/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolProvider?.__version>=3)return;

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

  function isExternal(url){
    return /^https?:\/\//i.test(String(url||""));
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
    }catch(_){
      return null;
    }
  }

  async function price(){
    const url="/bitcoin/bpi/api/latest.json";

    try{
      const data=await getJSON(
        W.ZZXAPI?.url ? W.ZZXAPI.url(url) : url,
        true
      );

      const value=Number(
        data?.price_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );

      return {
        value:Number.isFinite(value)&&value>0?value:NaN,
        source:data?.source||"ZZX Global BPI"
      };
    }catch(_){
      return {
        value:NaN,
        source:"price unavailable"
      };
    }
  }

  async function load(core){
    const s=await summary(core);

    const [fees,spot]=await Promise.all([
      recommendations(s.base),
      price()
    ]);

    return {
      summary:s.data,
      feeRecommendations:fees,
      priceUsd:spot.value,
      priceSource:spot.source,
      source:s.source,
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolProvider=Object.freeze({
    __version:3,
    bases,
    load
  });
})();
