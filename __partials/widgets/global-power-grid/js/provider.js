// __partials/widgets/global-power-grid/js/provider.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=3)return;

  const CACHE_KEY="zzx.global-power-grid.v10.46";
  const TTL=15*60*1000;

  function readCache(){
    try{return JSON.parse(W.localStorage.getItem(CACHE_KEY)||"null");}
    catch(_){return null;}
  }

  function writeCache(value){
    try{W.localStorage.setItem(CACHE_KEY,JSON.stringify(value));}
    catch(_){}
  }

  async function ensureScript(path,test){
    if(test())return;

    const src=new URL(path,W.location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<3000){
        await new Promise(resolve=>W.setTimeout(resolve,25));
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

    if(!test())throw new Error(`${path} did not register`);
  }

  async function ensureTransport(){
    await ensureScript(
      "/__partials/widgets/global-power-grid/js/quality.js",
      ()=>Number(W.ZZXGlobalPowerGridQuality?.__version||0)>=1
    );

    await ensureScript(
      "/__partials/widgets/global-power-grid/js/sources.js",
      ()=>Number(W.ZZXGlobalPowerGridSources?.__version||0)>=3
    );

    await ensureScript(
      "/__partials/widgets/global-power-grid/js/fetch.js",
      ()=>Number(W.ZZXGlobalPowerGridFetch?.__version||0)>=3
    );
  }

  async function ensureFactbookArchive(){
    if(Number(W.ZZXWorldFactbookArchive?.__version||0)>=2)return;

    const path=W.ZZXGlobalPowerGridSources?.archiveModule||
      "/__partials/worldfactbook/archive.js";

    await ensureScript(
      path,
      ()=>Number(W.ZZXWorldFactbookArchive?.__version||0)>=2
    );
  }

  async function loadFactbook(signal){
    const S=W.ZZXGlobalPowerGridSources;
    const Q=W.ZZXGlobalPowerGridQuality;
    const F=W.ZZXGlobalPowerGridFetch;

    const local=await F.bestJson(
      S.factbook,
      payload=>Q.scoreFactbook(payload),
      {signal}
    );

    if(local.data&&local.score>0){
      const filtered=Q.filterFactbook(local.data);
      return {
        data:local.data,
        source:local.source,
        transport:"local",
        quality:filtered.summary,
        error:local.error||""
      };
    }

    const errors=[];
    if(local.error)errors.push(local.error);

    try{
      await ensureFactbookArchive();

      const archive=await W.ZZXWorldFactbookArchive.loadElectricityHistory({
        force:false,
        signal,
        expand:true
      });

      const archiveScore=Q.scoreFactbook(archive);
      if(archiveScore>0){
        return {
          data:archive,
          source:archive.source||"World Factbook public archive",
          transport:archive.transport||"archive",
          quality:Q.filterFactbook(archive).summary,
          error:errors.join(" | ")
        };
      }
    }catch(error){
      if(error?.name==="AbortError")throw error;
      errors.push(String(error?.message||error));
    }

    const fallback=local.data||{
      schema:"zzx-global-power-grid-factbook-history-v2",
      records:[]
    };

    return {
      data:fallback,
      source:local.source||"unavailable",
      transport:"unavailable",
      quality:Q.filterFactbook(fallback).summary,
      error:errors.join(" | ")
    };
  }

  async function load({force=false,signal=null}={}){
    await ensureTransport();

    const cached=readCache();
    const now=Date.now();

    if(
      !force&&
      cached?.payload&&
      now-Number(cached.cachedAt||0)<TTL
    ){
      return {...cached,transport:"cache",stale:false};
    }

    if(typeof W.ZZXGlobalPowerGridSource?.load==="function"){
      try{
        const payload=await W.ZZXGlobalPowerGridSource.load({force,signal});
        const result={
          payload,
          source:{
            registry:"ZZXGlobalPowerGridSource",
            factbook:"ZZXGlobalPowerGridSource",
            factbookTransport:"shared",
            live:"ZZXGlobalPowerGridSource"
          },
          cachedAt:now,
          errors:[]
        };
        writeCache(result);
        return {...result,transport:"shared",stale:false};
      }catch(error){
        if(error?.name==="AbortError")throw error;
      }
    }

    const S=W.ZZXGlobalPowerGridSources;
    const Q=W.ZZXGlobalPowerGridQuality;
    const F=W.ZZXGlobalPowerGridFetch;

    const [registry,factbook,live]=await Promise.all([
      F.bestJson(S.registry,payload=>Q.scoreRegistry(payload),{signal}),
      loadFactbook(signal),
      F.bestJson(S.live,payload=>Q.scoreLive(payload),{signal})
    ]);

    if(!registry.data||Q.scoreRegistry(registry.data)<=0){
      throw new Error(registry.error||"Global Power Grid country registry unavailable");
    }

    const payload={
      registry:registry.data,
      factbook:factbook.data||{records:[]},
      live:live.data||{countries:[]}
    };

    const errors=[
      registry.error,
      factbook.error,
      live.error
    ].filter(Boolean);

    const result={
      payload,
      source:{
        registry:registry.source,
        factbook:factbook.source||"unavailable",
        factbookTransport:factbook.transport||"unavailable",
        factbookQuality:factbook.quality||null,
        live:live.source||"unavailable"
      },
      cachedAt:now,
      errors
    };

    writeCache(result);
    return {...result,transport:"local+archive",stale:false};
  }

  W.ZZXGlobalPowerGridProvider=Object.freeze({
    __version:3,
    load
  });
})();
