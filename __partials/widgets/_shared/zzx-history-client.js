(function(){
  "use strict";
  const W=window;
  if(W.ZZXHistoryClient?.__version>=5)return;

  const dynamicBase="/bitcoin/bpi/history";
  const staticLive="/bitcoin/bpi/api/history-live.json";
  let dynamicRetryAt=0;
  const url=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  async function json(path,{timeoutMs=5000}={}){
    const target=url(path);
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs,retries:0});
    }
    const ctl=new AbortController();
    const timer=W.setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const response=await fetch(target,{cache:"no-store",credentials:"same-origin",signal:ctl.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{W.clearTimeout(timer)}
  }

  function spanMs(timeframe){
    return ({"10s":10e3,"30s":30e3,"1m":60e3,"5m":300e3,"15m":900e3,"1h":3600e3,"4h":14400e3,"24h":86400e3,"7d":604800e3,"30d":2592000e3,"90d":7776000e3,"1y":31536000e3,"5y":157680000e3})[timeframe]||null;
  }

  function timestamp(row){
    const raw=row?.t??row?.ts_ms??row?.timestamp??row?.updated_at??row?.time??row?.date;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const parsed=new Date(raw).getTime();
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function normalize(row,source){
    const t=timestamp(row);
    const price=finite(row?.price??row?.close??row?.price_usd??row?.bpi_usd??row?.global_bpi_usd);
    if(!Number.isFinite(t)||!(price>0))return null;
    const open=finite(row?.open),high=finite(row?.high),low=finite(row?.low),close=finite(row?.close);
    const rolling=finite(row?.volume_24h_btc);
    const interval=finite(row?.interval_volume_btc);
    return {
      ...row,
      t,
      open:Number.isFinite(open)?open:price,
      high:Number.isFinite(high)?high:price,
      low:Number.isFinite(low)?low:price,
      close:Number.isFinite(close)?close:price,
      price:Number.isFinite(close)?close:price,
      volume_24h_btc:Number.isFinite(rolling)?rolling:null,
      interval_volume_btc:Number.isFinite(interval)?interval:null,
      source:row?.source??source,
      gap_before:row?.gap_before===true,
      gap_ms:Number.isFinite(finite(row?.gap_ms))?finite(row.gap_ms):0
    };
  }

  function gapMark(points,nominalMs=0){
    const sorted=[...points].sort((a,b)=>a.t-b.t);
    let nominal=finite(nominalMs);
    if(!(nominal>0)){
      const deltas=[];
      for(let i=1;i<sorted.length;i+=1){
        const delta=sorted[i].t-sorted[i-1].t;
        if(delta>0)deltas.push(delta);
      }
      nominal=deltas.length?Math.min(...deltas):0;
    }
    const threshold=nominal>0?nominal*1.5:Infinity;
    for(let i=0;i<sorted.length;i+=1){
      const delta=i?sorted[i].t-sorted[i-1].t:0;
      sorted[i].gap_before=i>0&&delta>threshold;
      sorted[i].gap_ms=sorted[i].gap_before?delta:0;
    }
    return sorted;
  }

  async function dynamicSeries({source,market,resolution,start,end,maxPoints}){
    if(Date.now()<dynamicRetryAt)throw new Error("dynamic history temporarily unavailable");
    const qs=new URLSearchParams({source,resolution,max_points:String(maxPoints)});
    if(market)qs.set("market",market);
    if(start!=null)qs.set("from",String(Math.trunc(start)));
    if(end!=null)qs.set("to",String(Math.trunc(end)));
    try{
      const data=await json(`${dynamicBase}/series?${qs.toString()}`,{timeoutMs:4500});
      if(!Array.isArray(data?.points))throw new Error("invalid dynamic history contract");
      const points=data.points.map(row=>normalize(row,source)).filter(Boolean);
      return {...data,points,transport:"python-sqlite-history-api"};
    }catch(error){
      dynamicRetryAt=Date.now()+15_000;
      throw error;
    }
  }

  async function staticSeries({source,start,end,maxPoints}){
    const merged=[];
    try{
      for(const row of W.ZZXLiveBPI?.history?.(source,start,end)||[]){
        const point=normalize(row,source);if(point)merged.push(point);
      }
    }catch(_){ }
    try{
      const payload=await json(staticLive,{timeoutMs:2500});
      for(const row of payload?.series?.[source]||[]){
        const point=normalize(row,source);if(point)merged.push(point);
      }
    }catch(_){ }
    const byTime=new Map();
    for(const point of merged){
      if(start!=null&&point.t<start)continue;
      if(end!=null&&point.t>end)continue;
      byTime.set(point.t,point);
    }
    const points=gapMark([...byTime.values()]);
    // Static mode is emergency presentation only. Do not reconstruct OHLCV or
    // decimate by skipping points in JavaScript; Python owns those semantics.
    return {source,resolution:"raw-fallback",points:points.slice(-maxPoints),from:start,to:end,transport:"static-emergency-fallback"};
  }

  async function series({source="global-bpi",market="",timeframe="24h",resolution="auto",maxPoints=5000,from=null,to=null}={}){
    const now=Date.now();
    const span=spanMs(timeframe);
    let start=from;
    let end=to||now;
    if(timeframe!=="all"&&start==null&&span)start=end-span;
    if(timeframe==="all"){
      try{
        const bounds=await json(`${dynamicBase}/bounds?source=${encodeURIComponent(source)}`,{timeoutMs:2500});
        start=bounds.min_ts||null;end=bounds.max_ts||now;
      }catch(_){dynamicRetryAt=Date.now()+15_000}
    }
    try{
      const result=await dynamicSeries({source,market,resolution,start,end,maxPoints});
      if(result.points.length>=1)return result;
    }catch(_){ }
    return await staticSeries({source,start,end,maxPoints});
  }

  async function sources(){
    const values=new Map([
      ["bpi",{source:"bpi",scope:"native",weighted:true}],
      ["bpi-unweighted",{source:"bpi-unweighted",scope:"native",weighted:false}],
      ["global-bpi",{source:"global-bpi",scope:"global",weighted:true}],
      ["global-bpi-unweighted",{source:"global-bpi-unweighted",scope:"global",weighted:false}]
    ]);
    try{
      const data=await json(`${dynamicBase}/sources`,{timeoutMs:2500});
      for(const row of data?.sources||[])if(row?.source)values.set(row.source,row);
    }catch(_){dynamicRetryAt=Date.now()+15_000}
    return {sources:[...values.values()]};
  }

  W.ZZXHistoryClient=Object.freeze({__version:5,series,sources,spanMs});
})();
