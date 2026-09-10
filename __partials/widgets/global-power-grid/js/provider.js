// __partials/widgets/global-power-grid/js/provider.js
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=1)return;

  const CACHE_KEY="zzx.global-power-grid.v10.35";
  const TTL=15*60*1000;

  async function fetchJson(url,signal){
    const r=await fetch(url,{cache:"no-store",credentials:"omit",signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function first(urls,signal){
    const errors=[];
    for(const url of urls){
      try{return {data:await fetchJson(url,signal),source:url}}catch(e){errors.push(`${url}: ${e?.message||e}`)}
    }
    return {data:null,source:null,error:errors.join(" | ")};
  }

  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null")}catch(_){return null}
  }
  function writeCache(v){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(_){}
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
      first([
        "/bitcoin/power-grid/api/factbook-history.json",
        "/__partials/widgets/global-power-grid/data/factbook-history.json"
      ],signal),
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
        live:live.source||"unavailable"
      },
      cachedAt:now,
      errors:[factbook.error,live.error].filter(Boolean)
    };

    writeCache(result);
    return {...result,transport:"local",stale:false};
  }

  W.ZZXGlobalPowerGridProvider=Object.freeze({__version:1,load});
})();
