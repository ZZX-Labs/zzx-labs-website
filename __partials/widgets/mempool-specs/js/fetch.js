// __partials/widgets/mempool-specs/js/fetch.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolSpecsFetch?.__version>=4)return;

  const memory=new Map();
  const inflight=new Map();
  const external=url=>/^https?:\/\//i.test(String(url||""));

  async function raw(url,{signal,timeoutMs=12000,retries=1}={}){
    if(W.ZZXAPI?.fetchRaw){
      return await W.ZZXAPI.fetchRaw(url,{
        cacheBust:!external(url),
        cache:"no-store",
        credentials:external(url)?"omit":"same-origin",
        timeoutMs,
        retries,
        retryDelayMs:450,
        signal
      });
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:external(url)?"omit":"same-origin",
      signal
    });
    if(!r.ok){
      const e=new Error(`HTTP ${r.status} ${url}`);
      e.status=r.status;
      throw e;
    }
    return r;
  }

  async function fetchJSON(url,{signal,ttlMs=0,coalesce=true}={}){
    const key=String(url||"");
    const cached=memory.get(key);
    if(ttlMs>0&&cached&&Date.now()-cached.at<ttlMs){
      return {ok:true,json:cached.value,from:"memory"};
    }

    if(coalesce&&inflight.has(key))return await inflight.get(key);

    const task=(async()=>{
      const r=await raw(url,{signal});
      const json=await r.json();
      if(ttlMs>0)memory.set(key,{at:Date.now(),value:json});
      return {ok:true,json,from:"direct"};
    })();

    if(coalesce)inflight.set(key,task);
    try{return await task}
    finally{if(coalesce)inflight.delete(key)}
  }

  async function fetchText(url,{signal,ttlMs=0,coalesce=true}={}){
    const key=`text:${url}`;
    const cached=memory.get(key);
    if(ttlMs>0&&cached&&Date.now()-cached.at<ttlMs){
      return {ok:true,text:cached.value,from:"memory"};
    }

    if(coalesce&&inflight.has(key))return await inflight.get(key);
    const task=(async()=>{
      const r=await raw(url,{signal});
      const text=await r.text();
      if(ttlMs>0)memory.set(key,{at:Date.now(),value:text});
      return {ok:true,text,from:"direct"};
    })();

    if(coalesce)inflight.set(key,task);
    try{return await task}
    finally{if(coalesce)inflight.delete(key)}
  }

  W.ZZXMempoolSpecsFetch=Object.freeze({__version:4,fetchJSON,fetchText});
})();
