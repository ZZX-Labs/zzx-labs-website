// __partials/widgets/hashrate/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateProvider?.__version||0)>=2)return;

  const CACHE_PREFIX="zzx.hashrate.v10.33.";
  const TTL_MS=5*60*1000;

  const PERIODS=Object.freeze({
    "1m":{label:"1 month"},
    "3m":{label:"3 months"},
    "6m":{label:"6 months"},
    "1y":{label:"1 year"}
  });

  function safeRead(key){
    try{
      const parsed=JSON.parse(W.localStorage.getItem(key)||"null");
      return parsed&&typeof parsed==="object"?parsed:null;
    }catch(_){
      return null;
    }
  }

  function safeWrite(key,value){
    try{
      W.localStorage.setItem(key,JSON.stringify(value));
    }catch(_){}
  }

  async function fetchJson(url,signal){
    const response=await fetch(url,{
      method:"GET",
      cache:"no-store",
      credentials:"omit",
      signal,
      headers:{Accept:"application/json"}
    });

    if(!response.ok){
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const text=await response.text();
    let json;

    try{
      json=JSON.parse(text);
    }catch(_){
      throw new Error(`Invalid JSON from ${url}`);
    }

    return json;
  }

  function localCandidates(period){
    return [
      `/bitcoin/mining/api/hashrate/${period}.json`,
      `/bitcoin/mining/hashrate/${period}.json`,
      `/api/bitcoin/hashrate/${period}.json`
    ];
  }

  function upstream(period){
    return `https://mempool.space/api/v1/mining/hashrate/${encodeURIComponent(period)}`;
  }

  async function load(period="1m",{force=false,signal=null}={}){
    if(!PERIODS[period])period="1m";

    const key=CACHE_PREFIX+period;
    const cached=safeRead(key);
    const now=Date.now();

    if(
      !force &&
      cached?.payload &&
      Number.isFinite(Number(cached.cachedAt)) &&
      now-Number(cached.cachedAt)<TTL_MS
    ){
      return {
        payload:cached.payload,
        source:cached.source||"cache",
        transport:"cache",
        stale:false,
        cached:true,
        period,
        label:PERIODS[period].label
      };
    }

    const errors=[];

    if(typeof W.ZZXHashrateSource?.load==="function"){
      try{
        const payload=await W.ZZXHashrateSource.load(period,{force,signal});
        if(payload&&typeof payload==="object"){
          safeWrite(key,{payload,source:"ZZXHashrateSource",cachedAt:now});
          return {
            payload,
            source:"ZZXHashrateSource",
            transport:"shared",
            stale:false,
            cached:false,
            period,
            label:PERIODS[period].label
          };
        }
      }catch(error){
        errors.push(`shared: ${error?.message||error}`);
      }
    }

    for(const url of localCandidates(period)){
      try{
        const payload=await fetchJson(url,signal);
        safeWrite(key,{payload,source:url,cachedAt:now});
        return {
          payload,
          source:url,
          transport:"local",
          stale:false,
          cached:false,
          period,
          label:PERIODS[period].label
        };
      }catch(error){
        errors.push(`${url}: ${error?.message||error}`);
      }
    }

    try{
      const url=upstream(period);
      const payload=await fetchJson(url,signal);
      safeWrite(key,{payload,source:"mempool.space",cachedAt:now});

      return {
        payload,
        source:"mempool.space",
        transport:"direct",
        stale:false,
        cached:false,
        period,
        label:PERIODS[period].label
      };
    }catch(error){
      errors.push(`mempool.space: ${error?.message||error}`);
    }

    if(cached?.payload){
      return {
        payload:cached.payload,
        source:cached.source||"cached fallback",
        transport:"cache",
        stale:true,
        cached:true,
        period,
        label:PERIODS[period].label,
        error:errors.join(" | ")
      };
    }

    throw new Error(`Hashrate sources unavailable: ${errors.join(" | ")}`);
  }

  W.ZZXHashrateProvider=Object.freeze({
    __version:2,
    PERIODS,
    load
  });
})();
