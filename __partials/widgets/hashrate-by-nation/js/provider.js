// __partials/widgets/hashrate-by-nation/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationProvider?.__version||0)>=3)return;

  const CACHE_KEY="zzx.hashrate-by-nation.inputs.v10.34";
  const TTL_MS=10*60*1000;

  function safeRead(){
    try{
      const parsed=JSON.parse(W.localStorage.getItem(CACHE_KEY)||"null");
      return parsed&&typeof parsed==="object"?parsed:null;
    }catch(_){
      return null;
    }
  }

  function safeWrite(value){
    try{
      W.localStorage.setItem(CACHE_KEY,JSON.stringify(value));
    }catch(_){}
  }

  async function fetchJson(url,signal){
    const response=await fetch(url,{
      method:"GET",
      cache:"no-store",
      credentials:"omit",
      signal,
      headers:{Accept:"application/json"}
    });

    if(!response.ok){
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const text=await response.text();

    try{
      return JSON.parse(text);
    }catch(_){
      throw new Error(`Invalid JSON from ${url}`);
    }
  }

  async function firstJson(urls,signal){
    const errors=[];

    for(const url of urls){
      try{
        return {
          data:await fetchJson(url,signal),
          source:url
        };
      }catch(error){
        errors.push(`${url}: ${error?.message||error}`);
      }
    }

    return {
      data:null,
      source:null,
      error:errors.join(" | ")
    };
  }

  async function ensureHashrateModules(signal){
    if(
      Number(W.ZZXHashrateModel?.__version||0)>=2 &&
      Number(W.ZZXHashrateProvider?.__version||0)>=2
    ){
      return true;
    }

    // Load modules from the preceding Hashrate v10.33 widget when available.
    const scripts=[
      [
        "/__partials/widgets/hashrate/js/model.js",
        ()=>Number(W.ZZXHashrateModel?.__version||0)>=2
      ],
      [
        "/__partials/widgets/hashrate/js/provider.js",
        ()=>Number(W.ZZXHashrateProvider?.__version||0)>=2
      ]
    ];

    for(const [src,test] of scripts){
      if(test())continue;

      await new Promise((resolve,reject)=>{
        const existing=[...document.scripts].find(
          script=>new URL(script.src,location.href).pathname===src
        );

        if(existing){
          const started=Date.now();
          const timer=setInterval(()=>{
            if(test()){
              clearInterval(timer);
              resolve();
            }else if(Date.now()-started>2500){
              clearInterval(timer);
              reject(new Error(`Timed out loading ${src}`));
            }
          },25);
          return;
        }

        const script=document.createElement("script");
        script.src=src;
        script.defer=true;
        script.dataset.hbnShared=src;
        script.onload=()=>test()
          ? resolve()
          : reject(new Error(`${src} did not register`));
        script.onerror=()=>reject(new Error(`Failed to load ${src}`));
        (document.head||document.documentElement).appendChild(script);
      });
    }

    return true;
  }

  async function loadHashrate(signal){
    if(typeof W.ZZXHashrateNationSource?.hashrate==="function"){
      const payload=await W.ZZXHashrateNationSource.hashrate({signal});
      return {
        model:W.ZZXHashrateModel.build(payload),
        source:"ZZXHashrateNationSource.hashrate"
      };
    }

    await ensureHashrateModules(signal);

    const result=await W.ZZXHashrateProvider.load(
      "1m",
      {force:false,signal}
    );

    return {
      model:W.ZZXHashrateModel.build(result.payload),
      source:result.source
    };
  }

  async function loadPools(signal){
    if(typeof W.ZZXHashrateNationSource?.pools==="function"){
      return {
        data:await W.ZZXHashrateNationSource.pools({signal}),
        source:"ZZXHashrateNationSource.pools"
      };
    }

    return firstJson(
      [
        "/bitcoin/mining/api/pools/24h.json",
        "/bitcoin/mining/pools/24h.json",
        "https://mempool.space/api/v1/mining/pools/24h"
      ],
      signal
    );
  }

  async function loadPoolEvidence(signal){
    if(typeof W.ZZXHashrateNationSource?.poolEvidence==="function"){
      return {
        data:await W.ZZXHashrateNationSource.poolEvidence({signal}),
        source:"ZZXHashrateNationSource.poolEvidence"
      };
    }

    return firstJson(
      [
        "/bitcoin/mining/api/hashrate-by-nation/pool-country-evidence.json",
        "/bitcoin/mining/api/pool-country-evidence.json",
        "/__partials/widgets/hashrate-by-nation/data/pool-country-evidence.json"
      ],
      signal
    );
  }

  async function loadGrid(signal){
    if(typeof W.ZZXHashrateNationSource?.grid==="function"){
      return {
        data:await W.ZZXHashrateNationSource.grid({signal}),
        source:"ZZXHashrateNationSource.grid"
      };
    }

    return firstJson(
      [
        "/bitcoin/mining/api/hashrate-by-nation/power-grid-24h.json",
        "/bitcoin/mining/api/power-grid/24h.json",
        "/__partials/widgets/hashrate-by-nation/data/power-grid-24h.json"
      ],
      signal
    );
  }

  async function loadNodes(){
    if(typeof W.ZZXHashrateNationSource?.nodes==="function"){
      return {
        data:await W.ZZXHashrateNationSource.nodes(),
        source:"ZZXHashrateNationSource.nodes"
      };
    }

    if(typeof W.ZZXBitnodes?.load==="function"){
      const detail=await W.ZZXBitnodes.load(false);
      return {
        data:detail?.snapshot||detail,
        source:"ZZXBitnodes"
      };
    }

    const local=await firstJson(
      [
        "/bitcoin/bitnodes/maps/data/map-countries.json",
        "/bitcoin/bitnodes/live-map/data/map-countries.json"
      ],
      null
    );

    if(local.data){
      const rows=
        local.data?.countries ??
        local.data?.rows ??
        local.data;

      return {
        data:Array.isArray(rows)?rows:[],
        source:local.source
      };
    }

    return {
      data:[],
      source:null,
      error:local.error
    };
  }

  async function load({force=false,signal=null}={}){
    const cached=safeRead();
    const now=Date.now();

    if(
      !force &&
      cached?.inputs &&
      Number.isFinite(Number(cached.cachedAt)) &&
      now-Number(cached.cachedAt)<TTL_MS
    ){
      return {
        ...cached,
        transport:"cache",
        stale:false
      };
    }

    const errors=[];

    try{
      const [hashrate,pools,poolEvidence,grid,nodes]=await Promise.all([
        loadHashrate(signal),
        loadPools(signal),
        loadPoolEvidence(signal),
        loadGrid(signal),
        loadNodes()
      ]);

      if(!hashrate?.model){
        throw new Error("global hashrate unavailable");
      }

      if(pools?.error)errors.push(pools.error);
      if(poolEvidence?.error)errors.push(poolEvidence.error);
      if(grid?.error)errors.push(grid.error);
      if(nodes?.error)errors.push(nodes.error);

      const inputs={
        hashrate:hashrate.model,
        pools:pools?.data||{},
        poolEvidence:poolEvidence?.data||{},
        grid:grid?.data||{},
        nodes:nodes?.data||[]
      };

      const result={
        inputs,
        sources:{
          hashrate:hashrate.source||"—",
          pools:pools?.source||"unavailable",
          poolEvidence:poolEvidence?.source||"unavailable",
          grid:grid?.source||"unavailable",
          nodes:nodes?.source||"unavailable"
        },
        cachedAt:now,
        errors
      };

      safeWrite(result);

      return {
        ...result,
        transport:"live",
        stale:false
      };
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(cached?.inputs){
        return {
          ...cached,
          transport:"cache",
          stale:true,
          errors:[
            ...(cached.errors||[]),
            String(error?.message||error)
          ]
        };
      }

      throw error;
    }
  }

  W.ZZXHashrateNationProvider=Object.freeze({
    __version:3,
    load
  });
})();
