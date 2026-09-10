// __partials/widgets/btc-prs/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXBitcoinPRProvider?.__version||0)>=2)return;

  const CACHE_KEY="zzx.bitcoin-core.prs.v2";
  const TTL=5*60*1000;

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }

  function writeCache(value){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(value))}catch(_){}
  }

  async function json(url,signal,github=false){
    const headers={Accept:github?"application/vnd.github+json":"application/json"};
    if(github)headers["X-GitHub-Api-Version"]="2022-11-28";

    const response=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      signal,
      headers
    });

    if(!response.ok)throw new Error(`HTTP ${response.status} ${url}`);
    return response.json();
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache();
    const now=Date.now();

    if(!force&&cached?.rows&&now-Number(cached.cachedAt||0)<TTL){
      return {...cached,transport:"cache",stale:false};
    }

    const local=[
      "/bitcoin/github/api/bitcoin-core/pulls.json",
      "/bitcoin/github/bitcoin-core/pulls.json"
    ];

    const errors=[];

    for(const url of local){
      try{
        const payload=await json(url,signal,false);
        const rows=Array.isArray(payload)?payload:(payload?.pulls||payload?.rows||[]);
        if(!Array.isArray(rows))throw new Error("invalid PR mirror payload");

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

    // Anonymous browser requests are deliberately disabled by default.
    // GitHub's unauthenticated quota is too small for a public HUD.
    if(W.ZZXGitHubDirectFallback===true){
      const url="https://api.github.com/repos/bitcoin/bitcoin/pulls?state=all&sort=updated&direction=desc&per_page=100";
      try{
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
      return {
        ...cached,
        transport:"cache",
        stale:true,
        error:errors.join(" | ")
      };
    }

    throw new Error(
      "Bitcoin Core PR mirror unavailable. Run the Bitcoin Core GitHub Activity workflow."
    );
  }

  W.ZZXBitcoinPRProvider=Object.freeze({__version:2,load});
})();
