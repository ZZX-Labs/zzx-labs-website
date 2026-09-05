// __partials/widgets/nodes/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesFetch?.__version>=3)return;

  const AO_RAW="https://api.allorigins.win/raw?url=";
  const mem=new Map();

  function external(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  function storageKey(url){
    return "zzx:nodes:v3:"+encodeURIComponent(String(url||""));
  }

  function loadCache(url,maxAge){
    try{
      const raw=localStorage.getItem(storageKey(url));
      if(!raw)return null;

      const value=JSON.parse(raw);
      if(!value||!value.data)return null;

      const age=Date.now()-Number(value.at||0);
      if(Number.isFinite(maxAge)&&age>maxAge)return null;

      return {
        data:value.data,
        at:Number(value.at||0)
      };
    }catch(_){
      return null;
    }
  }

  function saveCache(url,data){
    try{
      localStorage.setItem(
        storageKey(url),
        JSON.stringify({at:Date.now(),data})
      );
    }catch(_){}
  }

  async function rawJSON(url,local){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:W.ZZXNodesSources.timeoutMs,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs:W.ZZXNodesSources.timeoutMs,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:local?"same-origin":"omit"
    });

    if(!r.ok){
      const error=new Error(`HTTP ${r.status} ${url}`);
      error.status=r.status;
      throw error;
    }

    return await r.json();
  }

  function proxyEligible(error,url){
    if(!external(url))return false;

    const status=Number(error?.status);
    return (
      !Number.isFinite(status) ||
      status===0 ||
      status===429 ||
      status>=500
    );
  }

  async function json(url,{local=false,ttlMs=0,allowProxy=true}={}){
    const cached=ttlMs>0?loadCache(url,ttlMs):null;
    if(cached){
      return {
        data:cached.data,
        source:"cache",
        stale:false,
        cachedAt:cached.at
      };
    }

    if(mem.has(url))return await mem.get(url);

    const job=(async()=>{
      try{
        const data=await rawJSON(url,local);
        saveCache(url,data);

        return {
          data,
          source:local?"local":"direct",
          stale:false,
          cachedAt:Date.now()
        };
      }catch(error){
        if(allowProxy&&proxyEligible(error,url)){
          try{
            const prox=AO_RAW+encodeURIComponent(url);
            const data=await rawJSON(prox,false);
            saveCache(url,data);

            return {
              data,
              source:"proxy-fallback",
              stale:false,
              cachedAt:Date.now()
            };
          }catch(_){}
        }

        const stale=loadCache(
          url,
          W.ZZXNodesSources.staleMaxMs
        );

        if(stale){
          return {
            data:stale.data,
            source:"stale-cache",
            stale:true,
            cachedAt:stale.at
          };
        }

        throw error;
      }finally{
        mem.delete(url);
      }
    })();

    mem.set(url,job);
    return await job;
  }

  W.ZZXNodesFetch=Object.freeze({
    __version:3,
    json
  });
})();
