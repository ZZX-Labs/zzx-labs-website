(function(){
  "use strict";
  const W=window;
  if(W.ZZXUpstreamFallback?.__version>=1)return;

  const AO="https://api.allorigins.win/raw?url=";

  async function direct(url,options={}){
    const r=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      ...options
    });
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r;
  }

  function retryable(error){
    const status=Number(error?.status);
    return !Number.isFinite(status)||status===0||status===408||status===429||status>=500;
  }

  async function response(url,{allowAllOrigins=true}={}){
    try{
      return await direct(url);
    }catch(error){
      if(!allowAllOrigins||!retryable(error))throw error;
      return await direct(AO+encodeURIComponent(url));
    }
  }

  async function json(url,options){
    return await (await response(url,options)).json();
  }

  async function text(url,options){
    return await (await response(url,options)).text();
  }

  W.ZZXUpstreamFallback=Object.freeze({
    __version:1,
    response,
    json,
    text
  });
})();
