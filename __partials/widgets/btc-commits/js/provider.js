// __partials/widgets/btc-commits/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXBitcoinCommitProvider?.__version||0)>=1)return;

  const CACHE_KEY="zzx.bitcoin-core.commits.v1";
  const TTL=5*60*1000;

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }

  function writeCache(v){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(_){}
  }

  async function json(url,signal,github=false){
    const headers={Accept:github?"application/vnd.github+json":"application/json"};
    if(github)headers["X-GitHub-Api-Version"]="2022-11-28";

    const r=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      signal,
      headers
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache();
    const now=Date.now();

    if(!force&&cached?.rows&&now-Number(cached.cachedAt||0)<TTL){
      return {...cached,transport:"cache",stale:false};
    }

    const errors=[];
    for(const url of [
      "/bitcoin/github/api/bitcoin-core/commits.json",
      "/bitcoin/github/bitcoin-core/commits.json"
    ]){
      try{
        const payload=await json(url,signal,false);
        const rows=Array.isArray(payload)?payload:(payload?.commits||payload?.rows||[]);
        if(!Array.isArray(rows))throw new Error("invalid commit mirror payload");

        const result={
          rows,
          source:url,
          generatedAt:payload?.generated_at||null,
          cachedAt:now
        };
        writeCache(result);
        return {...result,transport:"local",stale:false};
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(String(error?.message||error));
      }
    }

    if(W.ZZXGitHubDirectFallback===true){
      try{
        const url="https://api.github.com/repos/bitcoin/bitcoin/commits?sha=master&per_page=100";
        const rows=await json(url,signal,true);
        const result={rows,source:"GitHub REST API",cachedAt:now};
        writeCache(result);
        return {...result,transport:"direct",stale:false};
      }catch(error){
        if(error?.name==="AbortError")throw error;
        errors.push(String(error?.message||error));
      }
    }

    if(cached?.rows){
      return {...cached,transport:"cache",stale:true,error:errors.join(" | ")};
    }

    throw new Error(
      "Bitcoin Core commit mirror unavailable. Run the Bitcoin Core GitHub Activity workflow."
    );
  }

  W.ZZXBitcoinCommitProvider=Object.freeze({__version:1,load});
})();
