(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerFetch?.__version>=5)return;

  function url(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}

  async function json(path,{optional=false,timeoutMs=10000}={}){
    const target=url(path);
    try{
      if(W.ZZXAPI?.jsonStrict){
        return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs,retries:1,retryDelayMs:350});
      }

      const ctl=new AbortController();
      const timer=W.setTimeout(()=>ctl.abort(),timeoutMs);
      try{
        const r=await fetch(target,{cache:"no-store",credentials:"same-origin",signal:ctl.signal});
        if(!r.ok)throw new Error(`HTTP ${r.status} ${target}`);
        return await r.json();
      }finally{W.clearTimeout(timer)}
    }catch(error){
      if(optional)return null;
      throw error;
    }
  }

  W.ZZXBitcoinTickerFetch=Object.freeze({__version:5,json});
})();
