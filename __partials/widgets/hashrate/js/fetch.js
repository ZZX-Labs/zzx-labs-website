// __partials/widgets/hashrate/js/fetch.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateFetch?.__version>=2)return;

  async function getJSON(url){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:false,
        timeoutMs:12000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:12000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{cache:"no-store",credentials:"omit"});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }

  function materialize(payload){
    let cur=payload;

    for(let i=0;i<8;i++){
      if(typeof cur==="string"){
        const s=cur.trim();
        if(s.startsWith("{")||s.startsWith("[")){
          try{cur=JSON.parse(s);continue}catch(_){}
        }
      }

      if(cur&&typeof cur==="object"&&!Array.isArray(cur)&&"data" in cur&&cur.data!==cur){
        cur=cur.data;
        continue;
      }

      break;
    }

    return cur;
  }

  function seriesFrom(payload){
    const p=materialize(payload);

    const arr=Array.isArray(p)
      ? p
      : Array.isArray(p?.hashrates)
        ? p.hashrates
        : Array.isArray(p?.data)
          ? p.data
          : Array.isArray(p?.series)
            ? p.series
            : [];

    const rows=[];

    for(const pt of arr){
      if(Array.isArray(pt)){
        const ts=Number(pt[0]);
        const hs=Number(pt[1]);
        if(Number.isFinite(hs)&&hs>0)rows.push({ts,hs});
        continue;
      }

      if(pt&&typeof pt==="object"){
        const ts=Number(pt.timestamp??pt.time??pt.t);
        const hs=Number(
          pt.hashrate ??
          pt.avgHashrate ??
          pt.avg_hashrate ??
          pt.value ??
          pt.v
        );
        if(Number.isFinite(hs)&&hs>0)rows.push({ts,hs});
      }
    }

    for(const row of rows){
      if(Number.isFinite(row.ts)&&row.ts>0&&row.ts<2e12)row.ts*=1000;
    }

    rows.sort((a,b)=>(a.ts||0)-(b.ts||0));
    return rows;
  }

  function currentFrom(payload,series){
    const p=materialize(payload);
    const explicit=Number(
      p?.currentHashrate ??
      p?.current_hashrate ??
      p?.hashrate
    );

    if(Number.isFinite(explicit)&&explicit>0)return explicit;
    return series.length?series[series.length-1].hs:NaN;
  }

  function difficultyFrom(payload){
    const p=materialize(payload);
    const value=Number(
      p?.currentDifficulty ??
      p?.current_difficulty ??
      p?.difficulty
    );

    return Number.isFinite(value)&&value>0?value:NaN;
  }

  async function load(core){
    let lastError=null;

    for(const base of W.ZZXHashrateSources.bases(core)){
      try{
        const payload=await getJSON(`${base}/v1/mining/hashrate/3d`);
        const series=seriesFrom(payload);

        if(!series.length)throw new Error("hashrate series empty");

        let difficulty=difficultyFrom(payload);

        if(!Number.isFinite(difficulty)){
          try{
            const d=await getJSON(`${base}/v1/difficulty-adjustment`);
            difficulty=Number(d?.currentDifficulty??d?.difficulty);
          }catch(_){}
        }

        return {
          base,
          source:`${base}/v1/mining/hashrate/3d`,
          payload,
          series,
          currentHs:currentFrom(payload,series),
          difficulty
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("hashrate endpoint unavailable");
  }

  W.ZZXHashrateFetch=Object.freeze({
    __version:2,
    getJSON,
    materialize,
    seriesFrom,
    difficultyFrom,
    load
  });
})();
