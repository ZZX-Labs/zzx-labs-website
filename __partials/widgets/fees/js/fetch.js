// __partials/widgets/fees/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXFeesFetch?.__version>=2)return;

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

  async function recommended(core){
    let lastError=null;

    for(const base of W.ZZXFeesSources.mempoolBases(core)){
      try{
        const data=await getJSON(`${base}/v1/fees/recommended`,false);
        return {data,source:`${base}/v1/fees/recommended`};
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("recommended fee endpoint unavailable");
  }

  async function price(){
    try{
      const data=await getJSON(W.ZZXFeesSources.price,true);
      const value=Number(
        data?.price_usd ??
        data?.btc_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );

      return {
        value:Number.isFinite(value)&&value>0?value:NaN,
        source:data?.source||"ZZX Global BPI"
      };
    }catch(_){
      return {value:NaN,source:"price unavailable"};
    }
  }

  W.ZZXFeesFetch=Object.freeze({
    __version:2,
    getJSON,
    recommended,
    price
  });
})();
