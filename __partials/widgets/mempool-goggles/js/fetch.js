// __partials/widgets/mempool-goggles/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolGogglesFetch?.__version>=1)return;

  const AO_RAW="https://api.allorigins.win/raw?url=";

  function external(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  async function direct(url,local=false){
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
        retryDelayMs:400
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
    return !Number.isFinite(status)||status===0||status===429||status>=500;
  }

  async function json(url,{local=false,allowProxy=true}={}){
    try{
      return await direct(url,local);
    }catch(error){
      if(!allowProxy||!proxyEligible(error,url))throw error;
      return await direct(AO_RAW+encodeURIComponent(url),false);
    }
  }

  W.ZZXMempoolGogglesFetch=Object.freeze({
    __version:1,
    json
  });
})();
