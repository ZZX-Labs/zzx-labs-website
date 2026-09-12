// __partials/widgets/block-stats/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXBlockStatsModel?.__version>=2)return;

  const TARGET_SECONDS=600;
  const MAX_BLOCK_WEIGHT=4_000_000;

  function num(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function median(values){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return NaN;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function mean(values){
    const a=values.filter(Number.isFinite);
    return a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN;
  }

  function stddev(values){
    const a=values.filter(Number.isFinite);
    if(!a.length)return NaN;
    const avg=mean(a);
    return Math.sqrt(a.reduce((s,v)=>s+((v-avg)**2),0)/a.length);
  }

  function timestampMs(v){
    const n=num(v);
    if(!Number.isFinite(n)||n<=0)return NaN;
    const a=Math.abs(n);
    if(a<1e11)return n*1000;
    if(a<1e14)return n;
    if(a<1e17)return n/1000;
    return n/1e6;
  }

  function subsidySat(height){
    const h=Math.max(0,Math.floor(num(height)||0));
    const era=Math.floor(h/210000);
    if(era>=64)return 0;
    return Math.floor(5_000_000_000/Math.pow(2,era));
  }

  function poolName(block){
    const e=block?.extras||{};
    return String(
      e?.pool?.name ??
      e?.pool?.slug ??
      e?.miner?.name ??
      e?.miner ??
      block?.pool?.name ??
      block?.pool ??
      "Unknown"
    ).trim()||"Unknown";
  }

  function normalizeBlock(raw){
    const extras=raw?.extras||{};
    const weight=num(raw?.weight);
    const size=num(raw?.size);
    const vsize=Number.isFinite(weight)?Math.ceil(weight/4):NaN;
    const totalFees=num(extras?.totalFees ?? raw?.total_fees ?? raw?.totalFees);
    const reward=num(extras?.reward ?? raw?.reward);
    const txCount=num(raw?.tx_count ?? raw?.txCount);
    const avgFeeRate=num(extras?.avgFeeRate ?? raw?.avg_fee_rate ?? raw?.avgFeeRate);
    const medianFeeRate=num(extras?.medianFee ?? extras?.medianFeeRate ?? raw?.median_fee_rate);
    const feeRange=(Array.isArray(extras?.feeRange)?extras.feeRange:[])
      .map(num)
      .filter(Number.isFinite);

    const height=num(raw?.height);
    const subsidy=subsidySat(height);

    return {
      raw,
      id:String(raw?.id ?? raw?.hash ?? ""),
      height,
      timestampMs:timestampMs(raw?.timestamp ?? raw?.time),
      medianTimeMs:timestampMs(raw?.mediantime ?? raw?.median_time),
      txCount,
      size,
      weight,
      vsize,
      totalFees,
      reward:Number.isFinite(reward)?reward:(Number.isFinite(totalFees)?subsidy+totalFees:NaN),
      subsidy,
      avgFeeRate,
      medianFeeRate,
      feeRange,
      avgFee:num(extras?.avgFee ?? raw?.avg_fee),
      expectedFees:num(extras?.expectedFees),
      expectedWeight:num(extras?.expectedWeight),
      difficulty:num(raw?.difficulty),
      version:num(raw?.version),
      bits:num(raw?.bits),
      nonce:num(raw?.nonce),
      previousblockhash:String(raw?.previousblockhash ?? raw?.previous_block_hash ?? ""),
      merkleRoot:String(raw?.merkle_root ?? raw?.merkleRoot ?? ""),
      pool:poolName(raw)
    };
  }

  function intervalsFor(blocks,count){
    const out=[];
    const max=Math.min(blocks.length-1,count);
    for(let i=0;i<max;i++){
      const a=blocks[i]?.timestampMs;
      const b=blocks[i+1]?.timestampMs;
      const d=(a-b)/1000;
      if(Number.isFinite(d)&&d>=0&&d<6*3600)out.push(d);
    }
    return out;
  }

  function summarizeWindow(blocks,count){
    const rows=blocks.slice(0,Math.min(count,blocks.length));
    const tx=rows.map(b=>b.txCount).filter(Number.isFinite);
    const weights=rows.map(b=>b.weight).filter(Number.isFinite);
    const fees=rows.map(b=>b.totalFees).filter(Number.isFinite);
    const rewards=rows.map(b=>b.reward).filter(Number.isFinite);

    const totalTx=tx.reduce((s,v)=>s+v,0);
    const totalWeight=weights.reduce((s,v)=>s+v,0);
    const totalVsize=totalWeight/4;
    const totalFees=fees.reduce((s,v)=>s+v,0);
    const totalReward=rewards.reduce((s,v)=>s+v,0);

    return {
      count:rows.length,
      totalTx,
      avgTx:tx.length?totalTx/tx.length:NaN,
      totalWeight,
      meanUtilization:weights.length
        ? mean(weights.map(v=>100*v/MAX_BLOCK_WEIGHT))
        : NaN,
      totalFees,
      avgFees:fees.length?totalFees/fees.length:NaN,
      realizedFeeDensity:totalVsize>0?totalFees/totalVsize:NaN,
      totalReward
    };
  }

  function build(rawBlocks){
    const blocks=(Array.isArray(rawBlocks)?rawBlocks:[])
      .map(normalizeBlock)
      .filter(b=>Number.isFinite(b.height)&&Number.isFinite(b.timestampMs))
      .sort((a,b)=>b.height-a.height);

    if(!blocks.length)throw new Error("empty recent block list");

    const tip=blocks[0];
    const intervals6=intervalsFor(blocks,6);
    const intervals12=intervalsFor(blocks,12);
    const intervals24=intervalsFor(blocks,24);

    const mean6=mean(intervals6);
    const mean12=mean(intervals12);
    const mean24=mean(intervals24);

    const cadence={
      mean6,
      mean12,
      mean24,
      median12:median(intervals12),
      stddev12:stddev(intervals12),
      fastest12:intervals12.length?Math.min(...intervals12):NaN,
      slowest12:intervals12.length?Math.max(...intervals12):NaN,
      blocksPerHour:Number.isFinite(mean12)&&mean12>0?3600/mean12:NaN,
      delta6Pct:Number.isFinite(mean6)?((mean6-TARGET_SECONDS)/TARGET_SECONDS)*100:NaN,
      delta12Pct:Number.isFinite(mean12)?((mean12-TARGET_SECONDS)/TARGET_SECONDS)*100:NaN,
      intervals6,
      intervals12,
      intervals24
    };

    const tipStats={
      utilization:Number.isFinite(tip.weight)?100*tip.weight/MAX_BLOCK_WEIGHT:NaN,
      txPerVmb:Number.isFinite(tip.txCount)&&Number.isFinite(tip.vsize)&&tip.vsize>0
        ? tip.txCount/(tip.vsize/1e6)
        : NaN,
      realizedFeeDensity:Number.isFinite(tip.totalFees)&&Number.isFinite(tip.vsize)&&tip.vsize>0
        ? tip.totalFees/tip.vsize
        : NaN,
      avgFeePerTx:Number.isFinite(tip.totalFees)&&Number.isFinite(tip.txCount)&&tip.txCount>0
        ? tip.totalFees/tip.txCount
        : NaN,
      feeShare:Number.isFinite(tip.totalFees)&&Number.isFinite(tip.reward)&&tip.reward>0
        ? 100*tip.totalFees/tip.reward
        : NaN
    };

    return {
      schema:"zzx-block-stats-model-v2",
      builtAt:Date.now(),
      blocks,
      tip,
      cadence,
      tipStats,
      window12:summarizeWindow(blocks,12),
      window24:summarizeWindow(blocks,24)
    };
  }

  W.ZZXBlockStatsModel=Object.freeze({
    __version:2,
    TARGET_SECONDS,
    MAX_BLOCK_WEIGHT,
    timestampMs,
    subsidySat,
    normalizeBlock,
    build
  });
})();
