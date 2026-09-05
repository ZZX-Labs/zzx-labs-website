// __partials/widgets/mempool-specs/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsFetch?.__version>=3)return;

  const AO_RAW="https://api.allorigins.win/raw?url=";
  const CACHE_PREFIX="zzx:mempool-specs:v3:";

  function external(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  function cacheKey(url,kind){
    return `${CACHE_PREFIX}${kind}:`+encodeURIComponent(String(url||""));
  }

  function readCache(url,kind,maxAge=24*60*60*1000){
    try{
      const raw=localStorage.getItem(cacheKey(url,kind));
      if(!raw)return null;
      const obj=JSON.parse(raw);
      if(!obj||Date.now()-Number(obj.at||0)>maxAge)return null;
      return obj.value;
    }catch(_){
      return null;
    }
  }

  function writeCache(url,kind,value){
    try{
      localStorage.setItem(
        cacheKey(url,kind),
        JSON.stringify({at:Date.now(),value})
      );
    }catch(_){}
  }

  async function raw(url,{signal}={}){
    if(W.ZZXAPI?.fetchRaw){
      return await W.ZZXAPI.fetchRaw(url,{
        cacheBust:!external(url),
        cache:"no-store",
        credentials:external(url)?"omit":"same-origin",
        timeoutMs:12000,
        retries:1,
        retryDelayMs:450,
        signal
      });
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:external(url)?"omit":"same-origin",
      signal
    });

    if(!r.ok){
      const error=new Error(`HTTP ${r.status} ${url}`);
      error.status=r.status;
      throw error;
    }

    return r;
  }

  function proxyEligible(error,url){
    const status=Number(error?.status);
    return external(url) && (
      !Number.isFinite(status) ||
      status===0 ||
      status===429 ||
      status>=500
    );
  }

  async function fetchText(url,{signal,allowProxy=true}={}){
    try{
      const r=await raw(url,{signal});
      const text=await r.text();
      writeCache(url,"text",text);
      return {ok:true,text,from:"direct"};
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(allowProxy && proxyEligible(error,url)){
        try{
          const r=await raw(AO_RAW+encodeURIComponent(url),{signal});
          const text=await r.text();
          writeCache(url,"text",text);
          return {ok:true,text,from:"proxy"};
        }catch(proxyError){
          if(proxyError?.name==="AbortError")throw proxyError;
        }
      }

      const cached=readCache(url,"text");
      if(cached!=null)return {ok:true,text:cached,from:"cache"};
      throw error;
    }
  }

  async function fetchJSON(url,{signal,allowProxy=true}={}){
    try{
      const r=await raw(url,{signal});
      const json=await r.json();
      writeCache(url,"json",json);
      return {ok:true,json,from:"direct"};
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(allowProxy && proxyEligible(error,url)){
        try{
          const r=await raw(AO_RAW+encodeURIComponent(url),{signal});
          const json=await r.json();
          writeCache(url,"json",json);
          return {ok:true,json,from:"proxy"};
        }catch(proxyError){
          if(proxyError?.name==="AbortError")throw proxyError;
        }
      }

      const cached=readCache(url,"json");
      if(cached!=null)return {ok:true,json:cached,from:"cache"};
      throw error;
    }
  }

  W.ZZXMempoolSpecsFetch=Object.freeze({
    __version:3,
    fetchText,
    fetchJSON
  });
})();
