(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicFetch?.__version>=2)return;

  async function json(url,{local=false}={}){
    if(W.ZZXMempoolLive?.json)return await W.ZZXMempoolLive.json(url,{local});
    if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(url,{cacheBust:local,timeoutMs:10000,retries:1});
    const r=await fetch(url,{cache:"no-store",credentials:local?"same-origin":"omit"});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }

  async function text(url,{local=false}={}){
    if(W.ZZXMempoolLive?.text)return await W.ZZXMempoolLive.text(url,{local});
    const r=await fetch(url,{cache:"no-store",credentials:local?"same-origin":"omit"});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  }

  W.ZZXMempoolMosaicFetch=Object.freeze({__version:2,json,text});
})();
