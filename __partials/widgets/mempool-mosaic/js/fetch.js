(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicFetch?.__version>=4)return;

  const cache=new Map();
  const inflight=new Map();
  const external=url=>/^https?:\/\//i.test(String(url||""));

  async function raw(url,{signal,timeoutMs=12000,retries=1}={}){
    if(W.ZZXAPI?.fetchRaw){
      return await W.ZZXAPI.fetchRaw(url,{
        cacheBust:!external(url),cache:"no-store",
        credentials:external(url)?"omit":"same-origin",
        timeoutMs,retries,retryDelayMs:400,signal
      });
    }

    let last;
    for(let attempt=0;attempt<=Math.max(0,retries);attempt++){
      const ctl=typeof AbortController==="function"?new AbortController():null;
      let timer=0;
      const relay=()=>ctl?.abort(signal?.reason);
      if(signal?.aborted)throw signal.reason||new DOMException("Aborted","AbortError");
      signal?.addEventListener?.("abort",relay,{once:true});
      if(ctl&&timeoutMs>0)timer=W.setTimeout(()=>ctl.abort(new DOMException("Timeout","TimeoutError")),timeoutMs);
      try{
        const r=await fetch(url,{cache:"no-store",credentials:external(url)?"omit":"same-origin",signal:ctl?.signal||signal});
        if(!r.ok){const e=new Error(`HTTP ${r.status} ${url}`);e.status=r.status;throw e;}
        return r;
      }catch(error){
        last=error;
        if(error?.name==="AbortError"||signal?.aborted||attempt>=retries)throw error;
        await new Promise(done=>W.setTimeout(done,300*(attempt+1)));
      }finally{
        W.clearTimeout(timer);
        signal?.removeEventListener?.("abort",relay);
      }
    }
    throw last||new Error(`fetch failed ${url}`);
  }

  async function fetchJSON(url,{signal,ttlMs=0,coalesce=true,timeoutMs=12000,retries=1}={}){
    const key=`json:${url}`;
    const old=cache.get(key);
    if(ttlMs>0&&old&&Date.now()-old.at<ttlMs)return old.value;
    if(coalesce&&inflight.has(key))return await inflight.get(key);
    const task=(async()=>{
      const r=await raw(url,{signal,timeoutMs,retries});
      const value=await r.json();
      if(ttlMs>0)cache.set(key,{at:Date.now(),value});
      return value;
    })();
    if(coalesce)inflight.set(key,task);
    try{return await task}finally{if(coalesce)inflight.delete(key)}
  }

  async function fetchText(url,{signal,ttlMs=0,coalesce=true,timeoutMs=12000,retries=1}={}){
    const key=`text:${url}`;
    const old=cache.get(key);
    if(ttlMs>0&&old&&Date.now()-old.at<ttlMs)return old.value;
    if(coalesce&&inflight.has(key))return await inflight.get(key);
    const task=(async()=>{
      const r=await raw(url,{signal,timeoutMs,retries});
      const value=await r.text();
      if(ttlMs>0)cache.set(key,{at:Date.now(),value});
      return value;
    })();
    if(coalesce)inflight.set(key,task);
    try{return await task}finally{if(coalesce)inflight.delete(key)}
  }

  W.ZZXMempoolMosaicFetch=Object.freeze({__version:4,raw,fetchJSON,fetchText});
})();
