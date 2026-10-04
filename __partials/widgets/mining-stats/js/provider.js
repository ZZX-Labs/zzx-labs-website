// __partials/widgets/mining-stats/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningStatsProvider?.__version >= 2) return;

  function normalizeBase(value){
    return String(value || "").trim().replace(/\/+$/g,"");
  }

  function mempoolBases(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  async function fetchJSON(url, local=false){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:10000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local ? "same-origin" : "omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:local ? "same-origin" : "omit"
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }

  function parseMs(value){
    if(value==null)return NaN;
    const numeric=Number(value);
    if(Number.isFinite(numeric))return numeric<2e12?numeric*1000:numeric;
    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:NaN;
  }

  async function firstMempool(core,path){
    let lastError=null;
    for(const base of mempoolBases(core)){
      try{
        return {data:await fetchJSON(`${base}${path}`,false),base};
      }catch(error){lastError=error;}
    }
    throw lastError || new Error(`mempool endpoint unavailable: ${path}`);
  }

  async function residentSnapshot(core){
    const path="/bitcoin/live/api/mining.json";
    const url=core?.ctx?.urlFor
      ? core.ctx.urlFor(path)
      : W.ZZXAPI?.url
        ? W.ZZXAPI.url(path)
        : path;
    const payload=await fetchJSON(url,true);
    const observedMs=parseMs(payload?.observed_at);
    if(!Number.isFinite(observedMs)||Date.now()-observedMs>90000){
      throw new Error("resident mining snapshot is stale");
    }
    return payload;
  }

  async function localSnapshot(core){
    const path="/__partials/widgets/mining-stats/mining-stats.json";
    const url=core?.ctx?.urlFor
      ? core.ctx.urlFor(path)
      : W.ZZXAPI?.url
        ? W.ZZXAPI.url(path)
        : path;

    try{return await fetchJSON(url,true);}
    catch(_){return {schema:"zzx-mining-stats-v2",updated:null,items:{}};}
  }

  function parseMiningPayload(hashratePayload,difficultyPayload){
    const current=Number(hashratePayload?.currentHashrate);
    const difficulty=Number(hashratePayload?.currentDifficulty);
    let nextAdjustmentPct=Number(
      difficultyPayload?.difficultyChange ??
      difficultyPayload?.difficultyChangePercent ??
      difficultyPayload?.estimatedDifficultyAdjustment
    );
    const nextAdjustmentBlocks=Number(
      difficultyPayload?.remainingBlocks ??
      difficultyPayload?.blocksRemaining
    );
    const ts=Number(
      difficultyPayload?.estimatedRetargetDate ??
      difficultyPayload?.estimatedRetargetTimestamp
    );
    const nextAdjustmentEta=Number.isFinite(ts)
      ? new Date(ts<2e12?ts*1000:ts).toISOString()
      : null;

    return {
      hashrateEhs:Number.isFinite(current)?current/1e18:NaN,
      difficulty,
      nextAdjustmentPct,
      nextAdjustmentBlocks,
      nextAdjustmentEta
    };
  }

  async function live(core){
    const sources=[];
    let height=NaN,blocks=[];

    if(W.ZZXChain){
      try{
        const [tip,recent]=await Promise.all([
          W.ZZXChain.tipHeight(false),
          W.ZZXChain.recentBlocks(false)
        ]);
        height=Number(tip.height);
        blocks=recent.blocks || [];
        sources.push("ZZXChain");
      }catch(_){}
    }

    let mining=null;
    let observedAt=null;
    let sourceUpdatedAt=null;

    try{
      const resident=await residentSnapshot(core);
      mining=parseMiningPayload(resident.hashrate||{},resident.difficulty_adjustment||{});
      observedAt=resident.observed_at||null;
      sourceUpdatedAt=resident.source_updated_at||null;
      sources.push("ZZX resident mining telemetry");
    }catch(_){
      let hashrate=null,difficultyAdjustment=null;
      try{
        const r=await firstMempool(core,"/v1/mining/hashrate/3d");
        hashrate=r.data;
        sources.push("direct mempool mining/hashrate fallback");
      }catch(_){}
      try{
        const r=await firstMempool(core,"/v1/difficulty-adjustment");
        difficultyAdjustment=r.data;
        sources.push("direct mempool difficulty fallback");
      }catch(_){}
      mining=parseMiningPayload(hashrate||{},difficultyAdjustment||{});
      observedAt=new Date().toISOString();
      const sourceCandidates=[
        hashRateTimestamp(hashrate),
        hashRateTimestamp(difficultyAdjustment)
      ].filter(Boolean);
      sourceUpdatedAt=sourceCandidates.sort().at(-1)||null;
    }

    const meanSeconds=W.ZZXMiningStatsModel.meanInterval(blocks);
    const blockTimeMin=Number.isFinite(meanSeconds)?meanSeconds/60:NaN;
    const blocks24h=Number.isFinite(meanSeconds)&&meanSeconds>0?86400/meanSeconds:NaN;
    const subsidyBTC=W.ZZXMiningStatsModel.subsidyBTC(height);
    const issuance24h=Number.isFinite(blocks24h)&&Number.isFinite(subsidyBTC)
      ? blocks24h*subsidyBTC
      : NaN;

    let fees24h=NaN;
    if(Array.isArray(blocks)&&blocks.length){
      const feeSamples=blocks
        .map(block=>Number(block?.extras?.totalFees ?? block?.total_fees))
        .filter(value=>Number.isFinite(value)&&value>=0);
      if(feeSamples.length&&Number.isFinite(blocks24h)){
        const meanFeeSats=feeSamples.reduce((sum,value)=>sum+value,0)/feeSamples.length;
        fees24h=(meanFeeSats*blocks24h)/1e8;
        sources.push("recent-block fee projection");
      }
    }

    const feeShare=Number.isFinite(fees24h)&&Number.isFinite(issuance24h)&&fees24h+issuance24h>0
      ? fees24h/(fees24h+issuance24h)
      : NaN;

    return {
      updated:observedAt||new Date().toISOString(),
      checkedAt:new Date().toISOString(),
      observedAt:observedAt||new Date().toISOString(),
      sourceUpdatedAt,
      hashrateEhs:mining.hashrateEhs,
      difficulty:mining.difficulty,
      blockTimeMin,
      blocks24h,
      issuance24h,
      subsidyBTC,
      fees24h,
      feeShare,
      nextAdjustmentPct:mining.nextAdjustmentPct,
      nextAdjustmentBlocks:mining.nextAdjustmentBlocks,
      nextAdjustmentEta:mining.nextAdjustmentEta,
      sources
    };
  }

  function hashRateTimestamp(payload){
    if(!payload||typeof payload!=="object")return null;
    const value=payload.updated_at??payload.updatedAt??payload.timestamp??payload.time??null;
    const ms=parseMs(value);
    return Number.isFinite(ms)?new Date(ms).toISOString():null;
  }

  async function load(core){
    const [local,liveData]=await Promise.all([localSnapshot(core),live(core)]);
    return W.ZZXMiningStatsModel.merge(local,liveData);
  }

  W.ZZXMiningStatsProvider=Object.freeze({
    __version:2,
    load
  });
})();
