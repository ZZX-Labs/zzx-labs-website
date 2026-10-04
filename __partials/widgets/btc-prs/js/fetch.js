// __partials/widgets/btc-prs/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXBitcoinPRFetch?.__version||0)>=2)return;

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)
      ? W.ZZXAPI.url(url)
      : url;
  }

  async function raw(url,{signal=null,github=false}={}){
    const target=resolved(url);
    const headers={
      Accept:github
        ? "application/vnd.github+json"
        : "application/json"
    };

    if(github){
      headers["X-GitHub-Api-Version"]="2022-11-28";
    }

    const response=await fetch(target,{
      cache:"no-store",
      credentials:/^https?:/i.test(target)?"omit":"same-origin",
      signal,
      headers
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
    return raw(url,options).then(response=>response.json());
  }

  function rowsFrom(payload){
    if(Array.isArray(payload))return payload;
    if(Array.isArray(payload?.pulls))return payload.pulls;
    if(Array.isArray(payload?.rows))return payload.rows;
    return null;
  }

  async function loadLocal(url,signal){
    const payload=await json(url,{signal,github:false});
    const rows=rowsFrom(payload);

    if(!rows){
      throw new Error(`Invalid pull-request mirror payload from ${url}`);
    }

    return {
      payload,
      rows,
      source:url,
      transport:"local",
      generatedAt:payload?.generated_at||payload?.generatedAt||null
    };
  }

  async function loadDirect(url,signal){
    const payload=await json(url,{signal,github:true});
    const rows=rowsFrom(payload);

    if(!rows){
      throw new Error("Invalid GitHub pull-request payload");
    }

    return {
      payload,
      rows,
      source:"GitHub · bitcoin/bitcoin",
      transport:"direct",
      generatedAt:null
    };
  }

  async function load({signal=null}={}){
    const S=W.ZZXBitcoinPRSources;
    if(!S){
      throw new Error("ZZXBitcoinPRSources is not loaded");
    }

    const errors=[];

    for(const url of [S.localPrimary,S.localFallback]){
      if(!url)continue;

      try{
        return await loadLocal(url,signal);
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(String(error?.message||error));
      }
    }

    if(W.ZZXGitHubDirectFallback===true){
      try{
        return await loadDirect(S.github,signal);
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(String(error?.message||error));
      }
    }

    throw new Error(
      "Bitcoin Core PR mirror unavailable. Run the Bitcoin Core GitHub Activity workflow."+
      (errors.length?` ${errors.join(" | ")}`:"")
    );
  }

  W.ZZXBitcoinPRFetch=Object.freeze({
    __version:2,
    raw,
    json,
    rowsFrom,
    load
  });
})();
