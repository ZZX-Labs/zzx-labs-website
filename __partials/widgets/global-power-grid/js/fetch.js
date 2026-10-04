// __partials/widgets/global-power-grid/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXGlobalPowerGridFetch?.__version||0)>=3)return;

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)
      ? W.ZZXAPI.url(url)
      : url;
  }

  async function raw(url,{signal=null}={}){
    const target=resolved(url);
    const external=/^https?:/i.test(target);

    const response=await fetch(target,{
      cache:"no-store",
      credentials:external?"omit":"same-origin",
      signal,
      headers:{Accept:"application/json"}
    });

    if(!response.ok){
      const error=new Error(`HTTP ${response.status} ${target}`);
      error.status=response.status;
      error.url=target;
      throw error;
    }

    return response;
  }

  async function json(url,options={}){
    const response=await raw(url,options);
    const text=await response.text();

    try{return JSON.parse(text);}
    catch(_){throw new Error(`Invalid JSON from ${resolved(url)}`);}
  }

  async function bestJson(urls,score,{signal=null}={}){
    const successes=[];
    const errors=[];

    for(const url of urls.filter(Boolean)){
      try{
        const data=await json(url,{signal});
        const value=Number(score?.(data)??0);
        successes.push({
          data,
          source:url,
          score:Number.isFinite(value)?value:0
        });
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(`${url}: ${error?.message||error}`);
      }
    }

    successes.sort((a,b)=>b.score-a.score);
    const best=successes[0]||null;

    return best
      ? {...best,error:errors.join(" | ")}
      : {data:null,source:null,score:0,error:errors.join(" | ")};
  }

  W.ZZXGlobalPowerGridFetch=Object.freeze({
    __version:3,
    raw,
    json,
    bestJson
  });
})();
