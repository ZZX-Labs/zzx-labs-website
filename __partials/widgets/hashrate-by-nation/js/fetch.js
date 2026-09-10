// __partials/widgets/hashrate-by-nation/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationFetch?.__version||0)>=4)return;

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)
      ? W.ZZXAPI.url(url)
      : url;
  }

  async function raw(url,{signal=null}={}){
    const target=resolved(url);

    const response=await fetch(target,{
      method:"GET",
      cache:"no-store",
      credentials:/^https?:/i.test(target)?"omit":"same-origin",
      signal,
      headers:{Accept:"application/json"}
    });

    if(!response.ok){
      const error=new Error(`HTTP ${response.status} for ${target}`);
      error.status=response.status;
      error.url=target;
      throw error;
    }

    return response;
  }

  async function json(url,{signal=null}={}){
    const response=await raw(url,{signal});
    const text=await response.text();

    try{
      return JSON.parse(text);
    }catch(_){
      const error=new Error(`Invalid JSON from ${resolved(url)}`);
      error.url=resolved(url);
      throw error;
    }
  }

  async function firstJson(urls,{signal=null}={}){
    const errors=[];

    for(const url of urls.filter(Boolean)){
      try{
        return {
          data:await json(url,{signal}),
          source:url,
          transport:/^https?:/i.test(url)?"direct":"local"
        };
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(`${url}: ${error?.message||error}`);
      }
    }

    return {
      data:null,
      source:null,
      transport:"unavailable",
      error:errors.join(" | ")
    };
  }

  W.ZZXHashrateNationFetch=Object.freeze({
    __version:4,
    raw,
    json,
    firstJson
  });
})();
