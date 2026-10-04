// __partials/widgets/nodes-by-version/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByVersionFetch?.__version>=3)return;

  const AO_RAW="https://api.allorigins.win/raw?url=";

  function external(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  async function direct(url,local=false){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:W.ZZXNodesByVersionSources.timeoutMs,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs:W.ZZXNodesByVersionSources.timeoutMs,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),W.ZZXNodesByVersionSources.timeoutMs);

    try{
      const r=await fetch(url,{
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        redirect:"follow",
        signal:ctl.signal,
        headers:{
          accept:"application/json,text/plain;q=0.9,*/*;q=0.8"
        }
      });

      if(!r.ok){
        const error=new Error(`HTTP ${r.status} ${url}`);
        error.status=r.status;
        throw error;
      }

      const text=await r.text();
      const trimmed=text.trim();

      if(
        trimmed.startsWith("<!doctype") ||
        trimmed.startsWith("<html") ||
        trimmed.includes("<body")
      ){
        throw new Error(`non-JSON response from ${url}`);
      }

      return JSON.parse(trimmed);
    }finally{
      clearTimeout(timer);
    }
  }

  function proxyEligible(error,url){
    if(!external(url))return false;
    const status=Number(error?.status);
    return !Number.isFinite(status)||status===0||status===429||status>=500;
  }

  async function json(url,{local=false,allowProxy=true}={}){
    try{
      return {
        data:await direct(url,local),
        transport:local?"local":"direct"
      };
    }catch(error){
      if(!allowProxy||!proxyEligible(error,url))throw error;

      return {
        data:await direct(AO_RAW+encodeURIComponent(url),false),
        transport:"proxy-fallback"
      };
    }
  }

  W.ZZXNodesByVersionFetch=Object.freeze({
    __version:3,
    json
  });
})();
