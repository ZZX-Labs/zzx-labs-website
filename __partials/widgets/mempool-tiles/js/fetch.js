// __partials/widgets/mempool-tiles/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesFetch?.__version>=1)return;

  const cache=new Map();

  async function request(url,{
    signal,
    ttlMs=0,
    timeoutMs=12000,
    as="json"
  }={}){
    const key=`${as}:${url}`;
    const now=Date.now();
    const cached=cache.get(key);

    if(ttlMs>0&&cached&&now-cached.at<ttlMs){
      return cached.value;
    }

    const controller=new AbortController();
    const timer=W.setTimeout(()=>controller.abort(),timeoutMs);

    const abort=()=>{
      try{controller.abort()}catch(_){}
    };

    if(signal){
      if(signal.aborted)abort();
      else signal.addEventListener("abort",abort,{once:true});
    }

    try{
      const response=await fetch(url,{
        signal:controller.signal,
        cache:"no-store",
        credentials:"omit",
        headers:{Accept:as==="json"?"application/json":"text/plain,*/*"}
      });

      if(!response.ok){
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const value=as==="json"
        ? await response.json()
        : await response.text();

      cache.set(key,{at:Date.now(),value});
      return value;
    }finally{
      W.clearTimeout(timer);
      if(signal)signal.removeEventListener("abort",abort);
    }
  }

  W.ZZXMempoolTilesFetch=Object.freeze({
    __version:1,
    json:(url,opts)=>request(url,{...(opts||{}),as:"json"}),
    text:(url,opts)=>request(url,{...(opts||{}),as:"text"}),
    clear:()=>cache.clear()
  });
})();
