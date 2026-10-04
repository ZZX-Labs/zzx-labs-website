// __partials/widgets/btc-commits/js/provider.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXBitcoinCommitProvider?.__version||0)>=2)return;

  const CACHE_KEY="zzx.bitcoin-core.commits.v2";
  const TTL=5*60*1000;

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }

  function writeCache(value){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(value))}catch(_){}
  }

  async function ensureScript(path,test){
    if(test())return;

    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);

    if(existing){
      const start=Date.now();
      while(!test()&&Date.now()-start<2500){
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      if(test())return;
    }

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=path;
      s.defer=true;
      s.onload=resolve;
      s.onerror=()=>reject(new Error(`Failed to load ${path}`));
      (D.head||D.documentElement).appendChild(s);
    });

    if(!test())throw new Error(`${path} did not register`);
  }

  async function ensureCompatibilityLayer(){
    await ensureScript(
      "/__partials/widgets/btc-commits/js/sources.js",
      ()=>Number(W.ZZXBTCCommitsSources?.__version||0)>=2
    );

    await ensureScript(
      "/__partials/widgets/btc-commits/js/fetch.js",
      ()=>Number(W.ZZXBTCCommitsFetch?.__version||0)>=2
    );
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache();
    const now=Date.now();

    if(!force&&cached?.rows&&now-Number(cached.cachedAt||0)<TTL){
      return {...cached,transport:"cache",stale:false};
    }

    try{
      await ensureCompatibilityLayer();

      const result=await W.ZZXBTCCommitsFetch.load({signal});
      const rows=result.rows||[];

      const saved={
        rows,
        source:result.source,
        generatedAt:result.generatedAt||null,
        cachedAt:now
      };

      writeCache(saved);

      return {
        ...saved,
        transport:result.transport||"local",
        stale:false
      };
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(cached?.rows){
        return {
          ...cached,
          transport:"cache",
          stale:true,
          error:String(error?.message||error)
        };
      }

      throw error;
    }
  }

  W.ZZXBitcoinCommitProvider=Object.freeze({
    __version:2,
    load
  });
})();
