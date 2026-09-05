// __partials/widgets/mining-stats/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningStatsProvider?.__version >= 1) return;

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

  async function firstMempool(core,path){
    let lastError=null;

    for(const base of mempoolBases(core)){
      try{
        return {
          data:await fetchJSON(`${base}${path}`,false),
          base
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError || new Error(`mempool endpoint unavailable: ${path}`);
  }

  async function localSnapshot(core){
    const path="/__partials/widgets/mining-stats/mining-stats.json";
    const url=core?.ctx?.urlFor
      ? core.ctx.urlFor(path)
      : W.ZZXAPI?.url
        ? W.ZZXAPI.url(path)
        : path;

    try{
      return await fetchJSON(url,true);
    }catch(_){
      return {schema:"zzx-mining-stats-v2",updated:null,items:{}};
    }
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

    let hashrateEhs=NaN,difficulty=NaN;
    try{
      const r=await firstMempool(core,"/v1/mining/hashrate/3d");
      const current=Number(r.data?.currentHashrate);
      if(Number.isFinite(current))hashrateEhs=current/1e18;
      difficulty=Number(r.data?.currentDifficulty);
      sources.push("mempool mining/hashrate");
    }catch(_){}

    let fees24h=NaN;
    try{
      const r=await firstMempool(core,"/v1/mining/blocks/fees/24h");
      const rows=Array.isArray(r.data) ? r.data : [];
      const feeSats=rows.reduce((sum,row)=>sum+Number(row?.avgHeight ?? 0)*0,0); // keep parser neutral
      const directTotal=Number(
        r.data?.totalFees ??
        r.data?.fees ??
        r.data?.sum ??
        NaN
      );
      if(Number.isFinite(directTotal))fees24h=directTotal/1e8;
      sources.push("mempool mining/fees");
    }catch(_){}

    let nextAdjustmentPct=NaN,nextAdjustmentBlocks=NaN,nextAdjustmentEta=null;
    try{
      const r=await firstMempool(core,"/v1/difficulty-adjustment");
      nextAdjustmentPct=Number(
        r.data?.difficultyChange ??
        r.data?.difficultyChangePercent ??
        r.data?.estimatedDifficultyAdjustment
      );
      nextAdjustmentBlocks=Number(
        r.data?.remainingBlocks ??
        r.data?.blocksRemaining
      );
      const ts=Number(
        r.data?.estimatedRetargetDate ??
        r.data?.estimatedRetargetTimestamp
      );
      if(Number.isFinite(ts)){
        nextAdjustmentEta=new Date(ts<2e12?ts*1000:ts).toISOString();
      }
      sources.push("mempool difficulty");
    }catch(_){}

    const meanSeconds=W.ZZXMiningStatsModel.meanInterval(blocks);
    const blockTimeMin=Number.isFinite(meanSeconds)?meanSeconds/60:NaN;
    const blocks24h=Number.isFinite(meanSeconds)&&meanSeconds>0?86400/meanSeconds:NaN;
    const subsidyBTC=W.ZZXMiningStatsModel.subsidyBTC(height);
    const issuance24h=Number.isFinite(blocks24h)&&Number.isFinite(subsidyBTC)
      ? blocks24h*subsidyBTC
      : NaN;

    // If the dedicated 24h mining-fee endpoint does not expose a simple
    // aggregate total, derive a transparent projection from recent blocks.
    if(!Number.isFinite(fees24h) && Array.isArray(blocks) && blocks.length){
      const feeSamples=blocks
        .map(block=>Number(block?.extras?.totalFees ?? block?.total_fees))
        .filter(value=>Number.isFinite(value) && value>=0);

      if(feeSamples.length && Number.isFinite(blocks24h)){
        const meanFeeSats=feeSamples.reduce((sum,value)=>sum+value,0)/feeSamples.length;
        fees24h=(meanFeeSats*blocks24h)/1e8;
        sources.push("recent-block fee projection");
      }
    }

    const feeShare=Number.isFinite(fees24h)&&Number.isFinite(issuance24h)&&fees24h+issuance24h>0
      ? fees24h/(fees24h+issuance24h)
      : NaN;

    return {
      updated:new Date().toISOString(),
      hashrateEhs,
      difficulty,
      blockTimeMin,
      blocks24h,
      issuance24h,
      subsidyBTC,
      fees24h,
      feeShare,
      nextAdjustmentPct,
      nextAdjustmentBlocks,
      nextAdjustmentEta,
      sources
    };
  }

  async function load(core){
    const [local,liveData]=await Promise.all([
      localSnapshot(core),
      live(core)
    ]);

    return W.ZZXMiningStatsModel.merge(local,liveData);
  }

  W.ZZXMiningStatsProvider=Object.freeze({
    __version:1,
    load
  });
})();
