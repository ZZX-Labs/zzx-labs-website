(function(){
  "use strict";
  const W=window;
  if(W.ZZXHistoryClient?.__version>=2)return;

  const dynamicBase="/bitcoin/bpi/history";
  const staticLive="/bitcoin/bpi/api/history-live.json";
  const staticHistory="/bitcoin/bpi/api/history.json";
  let dynamicRetryAt=0;

  const url=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  async function json(path,{timeoutMs=8000}={}){
    const target=url(path);
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs,retries:0});
    }
    const ctl=new AbortController();
    const timer=W.setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const r=await fetch(target,{cache:"no-store",credentials:"same-origin",signal:ctl.signal});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }finally{W.clearTimeout(timer)}
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

  function timestamp(row){
    const raw=row?.t??row?.ts_ms??row?.timestamp??row?.updated_at??row?.time??row?.date;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const parsed=new Date(raw).getTime();
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function normalizedPoint(row,source){
    const t=timestamp(row);
    const price=finite(
      source==="global-bpi"
        ? row?.global_bpi_usd??row?.global_bpi?.price_usd??row?.price_usd??row?.price??row?.close
        : row?.price_usd??row?.bpi_usd??row?.price??row?.close??row?.new_price_usd
    );
    if(!Number.isFinite(t)||!(price>0))return null;
    const open=finite(row?.open),high=finite(row?.high),low=finite(row?.low),close=finite(row?.close);
    return {
      t,
      open:Number.isFinite(open)?open:price,
      high:Number.isFinite(high)?high:price,
      low:Number.isFinite(low)?low:price,
      close:Number.isFinite(close)?close:price,
      price,
      volume_24h_btc:Number.isFinite(finite(row?.volume_24h_btc))?finite(row.volume_24h_btc):null,
      change:Number.isFinite(finite(row?.change))?finite(row.change):null,
      change_pct:Number.isFinite(finite(row?.change_pct))?finite(row.change_pct):null,
      market:row?.market??null,
      quote:row?.quote??"USD"
    };
  }

  function rowsFromHistoryPayload(payload){
    if(Array.isArray(payload))return payload;
    if(!payload||typeof payload!=="object")return [];
    for(const key of ["history","rows","records","points"]){
      if(Array.isArray(payload[key]))return payload[key];
    }
    return [];
  }

  function chooseResolution(start,end,maxPoints){
    const target=Math.max(1,(end-start)/Math.max(10,maxPoints));
    for(const [name,ms] of [["1s",1000],["5s",5000],["15s",15000],["30s",30000],["1m",60000],["5m",300000],["15m",900000],["1h",3600000],["4h",14400000],["1d",86400000],["1w",604800000]]){
      if(ms>=target)return name;
    }
    return "1w";
  }

  const RES={raw:0,"1s":1000,"5s":5000,"15s":15000,"30s":30000,"1m":60000,"5m":300000,"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000,"1w":604800000};

  function bucket(points,resolution,maxPoints){
    if(resolution==="raw")return points.slice(-maxPoints);
    const ms=RES[resolution];
    if(!ms)return points.slice(-maxPoints);
    const map=new Map();
    for(const p of points){
      const b=Math.floor(p.t/ms)*ms;
      let x=map.get(b);
      if(!x){
        x={t:b,open:p.open??p.price,high:p.high??p.price,low:p.low??p.price,close:p.close??p.price,price:p.price,volume_24h_btc:p.volume_24h_btc,quote:p.quote,market:p.market,_last:p.t};
        map.set(b,x);
      }else{
        x.high=Math.max(x.high,p.high??p.price);
        x.low=Math.min(x.low,p.low??p.price);
        if(p.t>=x._last){x.close=p.close??p.price;x.price=x.close;x.volume_24h_btc=p.volume_24h_btc;x.quote=p.quote;x.market=p.market;x._last=p.t}
      }
    }
    let prev=null;
    let out=[...map.values()].sort((a,b)=>a.t-b.t).map(x=>{
      delete x._last;
      const change=prev==null?null:x.close-prev;
      x.change=change;
      x.change_pct=prev?change/prev*100:null;
      prev=x.close;
      return x;
    });
    if(out.length>maxPoints){const step=Math.ceil(out.length/maxPoints);out=out.filter((_,i)=>i%step===0)}
    return out;
  }

  async function dynamicSeries({source,market,resolution,start,end,maxPoints}){
    if(Date.now()<dynamicRetryAt)throw new Error("dynamic history temporarily unavailable");
    const qs=new URLSearchParams({source,resolution,max_points:String(maxPoints)});
    if(market)qs.set("market",market);
    if(start!=null)qs.set("from",String(Math.trunc(start)));
    if(end!=null)qs.set("to",String(Math.trunc(end)));
    try{
      const data=await json(`${dynamicBase}/series?${qs.toString()}`,{timeoutMs:3500});
      if(!Array.isArray(data?.points))throw new Error("invalid dynamic history contract");
      return {...data,transport:"sqlite-history-api"};
    }catch(error){
      dynamicRetryAt=Date.now()+30_000;
      throw error;
    }
  }

  async function staticSeries({source,start,end,resolution,maxPoints}){
    const merged=[];

    // Browser-live data gives second-scale movement immediately after page load.
    try{
      for(const row of W.ZZXLiveBPI?.history?.(source,start,end)||[]){
        const p=normalizedPoint(row,source);if(p)merged.push(p);
      }
    }catch(_){}

    // Collector-generated rolling 24h/minute file works on the Python/nginx deployment.
    try{
      const live=await json(staticLive,{timeoutMs:3000});
      for(const row of live?.series?.[source]||[]){
        const p=normalizedPoint(row,source);if(p)merged.push(p);
      }
    }catch(_){}

    // Repository history keeps charts non-empty on GitHub Pages.
    if(source==="bpi"||source==="global-bpi"){
      try{
        const stored=await json(staticHistory,{timeoutMs:3000});
        for(const row of rowsFromHistoryPayload(stored)){
          const p=normalizedPoint(row,source);if(p)merged.push(p);
        }
      }catch(_){}
    }

    const byTime=new Map();
    for(const p of merged){
      if(start!=null&&p.t<start)continue;
      if(end!=null&&p.t>end)continue;
      byTime.set(p.t,p);
    }
    const points=[...byTime.values()].sort((a,b)=>a.t-b.t);
    const actualResolution=resolution==="auto"?chooseResolution(start??points[0]?.t??Date.now()-86400000,end??points.at(-1)?.t??Date.now(),maxPoints):resolution;
    const result=bucket(points,actualResolution,maxPoints);
    return {source,resolution:actualResolution,points:result,from:start,to:end,transport:"static+browser-fallback"};
  }

  async function series({source="global-bpi",market="",timeframe="24h",resolution="auto",maxPoints=5000,from=null,to=null}={}){
    const now=Date.now();
    const span=spanMs(timeframe);
    let start=from;
    let end=to||now;
    if(timeframe!=="all"&&start==null&&span)start=end-span;

    if(timeframe==="all"){
      try{
        if(Date.now()>=dynamicRetryAt){
          const bounds=await json(`${dynamicBase}/bounds?source=${encodeURIComponent(source)}`,{timeoutMs:2500});
          start=bounds.min_ts||null;end=bounds.max_ts||now;
        }
      }catch(_){dynamicRetryAt=Date.now()+30_000}
    }

    try{
      const dynamic=await dynamicSeries({source,market,resolution,start,end,maxPoints});
      if(dynamic.points.length>=2)return dynamic;
    }catch(_){}

    return await staticSeries({source,start,end,resolution,maxPoints});
  }

  async function sources(){
    const values=new Map([["bpi",{source:"bpi"}],["global-bpi",{source:"global-bpi"}]]);
    try{
      if(Date.now()>=dynamicRetryAt){
        const d=await json(`${dynamicBase}/sources`,{timeoutMs:2500});
        for(const row of d?.sources||[])if(row?.source)values.set(row.source,row);
      }
    }catch(_){dynamicRetryAt=Date.now()+30_000}
    try{
      for(const id of Object.keys(W.ZZXLiveBPI?.snapshot?.()?.exchanges||{}))values.set(id,{source:id,transport:"browser-live"});
    }catch(_){}
    return {sources:[...values.values()]};
  }

  W.ZZXHistoryClient=Object.freeze({__version:2,series,sources,spanMs});
})();
