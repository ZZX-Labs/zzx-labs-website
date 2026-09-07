(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgFetch?.__version>=5)return;

  function url(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}

  async function json(path,{optional=false}={}){
    const target=url(path);

    try{
      if(W.ZZXAPI?.jsonStrict){
        return await W.ZZXAPI.jsonStrict(target,{
          cacheBust:true,
          timeoutMs:W.ZZXBitAvgConstants.timeoutMs,
          retries:1
        });
      }

      const ctl=new AbortController();
      const timer=W.setTimeout(()=>ctl.abort(),W.ZZXBitAvgConstants.timeoutMs);
      try{
        const r=await fetch(target,{cache:"no-store",credentials:"same-origin",signal:ctl.signal});
        if(!r.ok)throw new Error(`HTTP ${r.status} ${target}`);
        return await r.json();
      }finally{
        W.clearTimeout(timer);
      }
    }catch(error){
      if(optional)return null;
      throw error;
    }
  }

  function save(value){
    try{
      W.localStorage.setItem(W.ZZXBitAvgConstants.cacheKey,JSON.stringify({at:Date.now(),value}));
      return true;
    }catch(_){return false}
  }

  function load(){
    try{
      const parsed=JSON.parse(W.localStorage.getItem(W.ZZXBitAvgConstants.cacheKey)||"null");
      if(!parsed?.value)return null;
      const age=Date.now()-Number(parsed.at||0);
      if(!(age>=0&&age<=W.ZZXBitAvgConstants.cacheMaxAgeMs))return null;
      return {value:parsed.value,ageMs:age};
    }catch(_){return null}
  }

  W.ZZXBitAvgFetch=Object.freeze({__version:5,json,save,load});
})();
