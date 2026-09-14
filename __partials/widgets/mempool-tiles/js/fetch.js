// __partials/widgets/mempool-tiles/js/fetch.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolTilesFetch?.__version>=2)return;

  const cache=new Map();
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

    const controller=new AbortController();
    const timer=W.setTimeout(()=>controller.abort(),timeoutMs);
    const abort=()=>{try{controller.abort()}catch(_){}};
    if(signal){
      if(signal.aborted)abort();
      else signal.addEventListener("abort",abort,{once:true});
    }

    try{
      const response=await fetch(url,{
        signal:controller.signal,
        cache:"no-store",
        credentials:external(url)?"omit":"same-origin"
      });
      if(!response.ok){
        const error=new Error(`HTTP ${response.status} ${url}`);
        error.status=response.status;
        throw error;
      }
      return response;
    }finally{
      W.clearTimeout(timer);
      if(signal)signal.removeEventListener("abort",abort);
    }
  }

  async function request(url,{signal,ttlMs=0,timeoutMs=12000,retries=1,as="json",coalesce=true}={}){
    const key=`${as}:${url}`;
    const now=Date.now();
    const cached=cache.get(key);
    if(ttlMs>0&&cached&&now-cached.at<ttlMs)return cached.value;
    if(coalesce&&inflight.has(key))return await inflight.get(key);

    const task=(async()=>{
      const response=await raw(url,{signal,timeoutMs,retries});
      const value=as==="json"?await response.json():await response.text();
      if(ttlMs>0)cache.set(key,{at:Date.now(),value});
      return value;
    })();

    if(coalesce)inflight.set(key,task);
    try{return await task}
    finally{if(coalesce)inflight.delete(key)}
  }

  W.ZZXMempoolTilesFetch=Object.freeze({
    __version:2,
    raw,
    json:(url,opts)=>request(url,{...(opts||{}),as:"json"}),
    text:(url,opts)=>request(url,{...(opts||{}),as:"text"}),
    clear:()=>{cache.clear();inflight.clear()}
  });
})();
