(function(){
  "use strict";
  const W=window;
  if(W.ZZXHistoryClient?.__version>=1)return;

  const base="/bitcoin/bpi/history";
  const url=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;

  async function json(path){
    const target=url(path);
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs:10000,retries:1});
    }
    const r=await fetch(target,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function spanMs(timeframe){
    const map={
      "10s":10e3,"30s":30e3,"1m":60e3,"5m":300e3,"15m":900e3,
      "1h":3600e3,"4h":14400e3,"24h":86400e3,"7d":604800e3,
      "30d":2592000e3,"90d":7776000e3,"1y":31536000e3,
      "5y":157680000e3
    };
    return map[timeframe]||null;
  }

  async function series({
    source="global-bpi",
    market="",
    timeframe="24h",
    resolution="auto",
    maxPoints=5000,
    from=null,
    to=null
  }={}){
    const now=Date.now();
    const span=spanMs(timeframe);
    let start=from;
    let end=to||now;

    if(timeframe==="all"){
      const bounds=await json(`${base}/bounds?source=${encodeURIComponent(source)}`);
      start=bounds.min_ts||0;
      end=bounds.max_ts||now;
    }else if(start==null&&span){
      start=end-span;
    }

    const qs=new URLSearchParams({
      source,
      resolution,
      max_points:String(maxPoints)
    });
    if(market)qs.set("market",market);
    if(start!=null)qs.set("from",String(Math.trunc(start)));
    if(end!=null)qs.set("to",String(Math.trunc(end)));

    return await json(`${base}/series?${qs.toString()}`);
  }

  async function sources(){
    return await json(`${base}/sources`);
  }

  W.ZZXHistoryClient=Object.freeze({__version:1,series,sources,spanMs});
})();
