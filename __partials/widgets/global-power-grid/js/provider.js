// __partials/widgets/global-power-grid/js/provider.js
(function(){
  "use strict";
  const W=window,D=document;
  if(Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=2)return;

  const CACHE_KEY="zzx.global-power-grid.v10.38";
  const TTL=15*60*1000;

  async function fetchJson(url,signal){
    const r=await fetch(url,{cache:"no-store",credentials:"omit",signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function first(urls,signal){
    const errors=[];
    for(const url of urls){
      try{return {data:await fetchJson(url,signal),source:url}}
      catch(e){errors.push(`${url}: ${e?.message||e}`)}
    }
    return {data:null,source:null,error:errors.join(" | ")};
  }

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }
  function writeCache(v){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(_){}
  }

  async function ensureFactbookArchive(){
    if(Number(W.ZZXWorldFactbookArchive?.__version||0)>=1)return;

    const path="/__partials/worldfactbook/archive.js";
    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);

    if(existing){
      const start=Date.now();
      while(Number(W.ZZXWorldFactbookArchive?.__version||0)<1&&Date.now()-start<3000){
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      if(Number(W.ZZXWorldFactbookArchive?.__version||0)>=1)return;
    }

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.dataset.zzxWorldfactbookArchive="1";
      s.onload=resolve;
      s.onerror=()=>reject(new Error(`Failed ${path}`));
      (D.head||D.documentElement).appendChild(s);
    });

    if(Number(W.ZZXWorldFactbookArchive?.__version||0)<1){
      throw new Error("ZZXWorldFactbookArchive did not register");
    }
  }

  async function loadFactbook(signal){
    const local=await first([
      "/worldfactbook/api/electricity-history.json",
      "/bitcoin/power-grid/api/factbook-history.json",
      "/__partials/widgets/global-power-grid/data/factbook-history.json"
    ],signal);

    if(Array.isArray(local.data?.records)&&local.data.records.length){
      return {data:local.data,source:local.source,transport:"static"};
    }

    try{
      await ensureFactbookArchive();
      const data=await W.ZZXWorldFactbookArchive.loadElectricityHistory({
        force:false,
        signal,
        expand:true
      });
      return {
        data,
        source:data.source||"ZZXWorldFactbookArchive",
        transport:data.transport||"archive"
      };
    }catch(error){
      return {
        data:local.data||{records:[]},
        source:local.source||"unavailable",
        transport:"empty",
        error:String(error?.message||error)
      };
    }
  }

  async function load({force=false,signal=null}={}){
    const cached=readCache();
    const now=Date.now();

    if(!force&&cached?.payload&&now-Number(cached.cachedAt||0)<TTL){
      return {...cached,transport:"cache",stale:false};
    }

    if(typeof W.ZZXGlobalPowerGridSource?.load==="function"){
      try{
        const payload=await W.ZZXGlobalPowerGridSource.load({force,signal});
        const result={payload,source:"ZZXGlobalPowerGridSource",cachedAt:now};
        writeCache(result);
        return {...result,transport:"shared",stale:false};
      }catch(_){}
    }

    const [registry,factbook,live]=await Promise.all([
      first([
        "/bitcoin/power-grid/api/countries.json",
        "/__partials/widgets/global-power-grid/data/countries.json"
      ],signal),
      loadFactbook(signal),
      first([
        "/bitcoin/power-grid/api/live-grid.json",
        "/__partials/widgets/global-power-grid/data/live-grid.json"
      ],signal)
    ]);

    if(!registry.data)throw new Error(registry.error||"country registry unavailable");

    const payload={
      registry:registry.data,
      factbook:factbook.data||{records:[]},
      live:live.data||{countries:[]}
    };

    const result={
      payload,
      source:{
        registry:registry.source,
        factbook:factbook.source||"unavailable",
        factbookTransport:factbook.transport||"unknown",
        live:live.source||"unavailable"
      },
      cachedAt:now,
      errors:[factbook.error,live.error].filter(Boolean)
    };

    writeCache(result);
    return {...result,transport:"local+archive",stale:false};
  }

  W.ZZXGlobalPowerGridProvider=Object.freeze({__version:2,load});
})();
