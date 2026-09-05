// __partials/widgets/tip-drift/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTipDriftFetch?.__version>=4)return;

  const AO_RAW="https://api.allorigins.win/raw?url=";

  function external(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  async function raw(url){
    if(W.ZZXAPI?.fetchRaw){
      return await W.ZZXAPI.fetchRaw(url,{
        cache:"no-store",
        credentials:external(url)?"omit":"same-origin",
        timeoutMs:W.ZZXTipDriftSources.timeoutMs,
        retries:1,
        retryDelayMs:400
      });
    }

    const ctl=new AbortController();
    const timer=W.setTimeout(
      ()=>ctl.abort(),
      W.ZZXTipDriftSources.timeoutMs
    );

    try{
      const r=await fetch(url,{
        cache:"no-store",
        credentials:external(url)?"omit":"same-origin",
        signal:ctl.signal
      });

      if(!r.ok){
        const error=new Error(`HTTP ${r.status} ${url}`);
        error.status=r.status;
        throw error;
      }

      return r;
    }finally{
      W.clearTimeout(timer);
    }
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

  async function text(url,{allowProxy=true}={}){
    try{
      return {
        value:await (await raw(url)).text(),
        transport:"direct"
      };
    }catch(error){
      if(!allowProxy||!proxyEligible(error,url))throw error;

      const prox=AO_RAW+encodeURIComponent(url);
      return {
        value:await (await raw(prox)).text(),
        transport:"proxy-fallback"
      };
    }
  }

  async function json(url,{allowProxy=true}={}){
    try{
      return {
        value:await (await raw(url)).json(),
        transport:"direct"
      };
    }catch(error){
      if(!allowProxy||!proxyEligible(error,url))throw error;

      const prox=AO_RAW+encodeURIComponent(url);
      return {
        value:await (await raw(prox)).json(),
        transport:"proxy-fallback"
      };
    }
  }

  W.ZZXTipDriftFetch=Object.freeze({
    __version:4,
    text,
    json
  });
})();
