// __partials/widgets/themarketbtccreated/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTheMarketBTCCreatedFetch?.__version>=4)return;

  function url(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  async function json(path){
    const target=url(path);

    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{
        cacheBust:true,
        timeoutMs:W.ZZXTheMarketBTCCreatedSources.timeoutMs,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(target,{
        cacheBust:true,
        cache:"no-store",
        credentials:"same-origin",
        timeoutMs:W.ZZXTheMarketBTCCreatedSources.timeoutMs,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const ctl=new AbortController();
    const timer=W.setTimeout(
      ()=>ctl.abort(),
      W.ZZXTheMarketBTCCreatedSources.timeoutMs
    );

    try{
      const r=await fetch(target,{
        cache:"no-store",
        credentials:"same-origin",
        signal:ctl.signal,
        headers:{accept:"application/json"}
      });

      if(!r.ok)throw new Error(`HTTP ${r.status} ${target}`);
      return await r.json();
    }finally{
      W.clearTimeout(timer);
    }
  }

  function save(value){
    try{
      localStorage.setItem(
        W.ZZXTheMarketBTCCreatedSources.cacheKey,
        JSON.stringify({
          at:Date.now(),
          value
        })
      );
    }catch(_){}
  }

  function load(){
    try{
      const raw=localStorage.getItem(
        W.ZZXTheMarketBTCCreatedSources.cacheKey
      );
      if(!raw)return null;

      const parsed=JSON.parse(raw);
      if(!parsed?.value)return null;

      const age=Date.now()-Number(parsed.at||0);
      if(age>W.ZZXTheMarketBTCCreatedSources.cacheMaxAgeMs)return null;

      return {
        value:parsed.value,
        at:Number(parsed.at||0)
      };
    }catch(_){
      return null;
    }
  }

  W.ZZXTheMarketBTCCreatedFetch=Object.freeze({
    __version:4,
    json,
    save,
    load
  });
})();
