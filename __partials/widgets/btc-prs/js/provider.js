// __partials/widgets/btc-prs/js/provider.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXBitcoinPRProvider?.__version||0)>=3)return;

  const CACHE_KEY="zzx.bitcoin-core.prs.v3";
  const TTL=5*60*1000;

  function readCache(){
    try{
      return JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
    }catch(_){
      return null;
    }
  }

  function writeCache(value){
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify(value));
    }catch(_){}
  }

  async function ensureScript(path,test){
    if(test())return;

    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();

      while(!test()&&Date.now()-started<2500){
        await new Promise(resolve=>setTimeout(resolve,25));
      }

      if(test())return;
    }

    await new Promise((resolve,reject)=>{
      const script=D.createElement("script");
      script.src=path;
      script.defer=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error(`Failed to load ${path}`));
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test()){
      throw new Error(`${path} did not register`);
    }
  }

  async function ensureTransport(){
    await ensureScript(
      "/__partials/widgets/btc-prs/js/sources.js",
      ()=>Number(W.ZZXBitcoinPRSources?.__version||0)>=2
    );

    await ensureScript(
      "/__partials/widgets/btc-prs/js/fetch.js",
      ()=>Number(W.ZZXBitcoinPRFetch?.__version||0)>=2
    );
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache();
    const now=Date.now();

    if(
      !force &&
      cached?.rows &&
      now-Number(cached.cachedAt||0)<TTL
    ){
      return {
        ...cached,
        transport:"cache",
        stale:false
      };
    }

    try{
      await ensureTransport();

      const result=await W.ZZXBitcoinPRFetch.load({signal});

      const saved={
        rows:result.rows||[],
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

  W.ZZXBitcoinPRProvider=Object.freeze({
    __version:3,
    load
  });
})();
