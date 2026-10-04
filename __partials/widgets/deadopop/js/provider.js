// __partials/widgets/deadopop/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXDeadOPopProvider?.__version>=2)return;

  const CACHE_KEY="zzx:deadopop:deadcoins:v4";

  function candidates(){
    const url=path=>W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
    return {
      api:[
        url("/bitcoin/bpi/api/deadopop.json"),
        url("/api/deadopop.json")
      ],
      registry:[
        url("/bitcoin/bpi/data/deadcoins_registry.json"),
        url("/bitcoin/bpi/api/deadcoins_registry.json"),
        url("/bitcoin/bpi/deadcoins_registry.json")
      ]
    };
  }

  async function getJSON(url){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:true,
        timeoutMs:12000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:true,
        cache:"no-store",
        credentials:"same-origin",
        timeoutMs:12000,
        retries:1
      });
      return await r.json();
    }

    const r=await fetch(url,{cache:"no-store",credentials:"same-origin"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function save(model){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(model))}catch(_){}
  }

  function cached(){
    try{
      const raw=localStorage.getItem(CACHE_KEY);
      if(!raw)return null;
      const data=JSON.parse(raw);
      return data&&Array.isArray(data.rows)&&data.rows.length?data:null;
    }catch(_){return null}
  }

  async function load(){
    const c=candidates();
    const errors=[];

    for(const url of c.api){
      try{
        const model=W.ZZXDeadOPopModel.normalizeAPI(await getJSON(url));
        save(model);
        return {...model,sourceURL:url};
      }catch(error){errors.push(`${url}: ${String(error?.message||error)}`)}
    }

    for(const url of c.registry){
      try{
        const model=W.ZZXDeadOPopModel.normalizeRegistry(await getJSON(url));
        save(model);
        return {...model,sourceURL:url};
      }catch(error){errors.push(`${url}: ${String(error?.message||error)}`)}
    }

    const cache=cached();
    if(cache)return {...cache,source:"cached",sourceURL:"localStorage"};

    throw new Error(errors.join(" | ") || "DeadOPop sources unavailable");
  }

  W.ZZXDeadOPopProvider=Object.freeze({
    __version:2,
    load
  });
})();
