// __partials/widgets/btc-prs/js/provider.js
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXBitcoinPRProvider?.__version||0)>=1)return;

  const CACHE_KEY="zzx.bitcoin-core.prs.v1";
  const TTL=5*60*1000;

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }
  function writeCache(v){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(_){}
  }
  async function fetchJson(url,signal){
    const r=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      signal,
      headers:{
        Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28"
      }
    });
    if(!r.ok)throw new Error(`GitHub HTTP ${r.status}`);
    return r.json();
  }

  function candidates(){
    return [
      "/bitcoin/github/api/bitcoin-core/pulls.json",
      "/bitcoin/github/bitcoin-core/pulls.json",
      "https://api.github.com/repos/bitcoin/bitcoin/pulls?state=all&sort=updated&direction=desc&per_page=100"
    ];
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache(),now=Date.now();
    if(!force&&cached?.rows&&now-Number(cached.cachedAt||0)<TTL){
      return {...cached,transport:"cache",stale:false};
    }

    const errors=[];
    for(const url of candidates()){
      try{
        const payload=await fetchJson(url,signal);
        const rows=Array.isArray(payload)?payload:(payload?.pulls||payload?.rows||[]);
        if(!Array.isArray(rows))throw new Error("PR payload is not an array");
        const result={
          rows,
          source:url.startsWith("https://api.github.com/")?"GitHub REST API":url,
          cachedAt:now
        };
        writeCache(result);
        return {...result,transport:url.startsWith("https://")?"direct":"local",stale:false};
      }catch(e){
        if(e?.name==="AbortError")throw e;
        errors.push(`${url}: ${e?.message||e}`);
      }
    }

    if(cached?.rows){
      return {...cached,transport:"cache",stale:true,error:errors.join(" | ")};
    }
    throw new Error(`Bitcoin Core PR feed unavailable: ${errors.join(" | ")}`);
  }

  W.ZZXBitcoinPRProvider=Object.freeze({__version:1,load});
})();
