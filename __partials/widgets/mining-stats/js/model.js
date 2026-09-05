// __partials/widgets/mining-stats/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningStatsModel?.__version >= 1) return;

  const HALVING_INTERVAL = 210000;
  const INITIAL_SUBSIDY_SATS = 5000000000n;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function subsidyBTC(height) {
    const h = Math.floor(finite(height));
    if (!Number.isFinite(h) || h < 0) return NaN;

    const era = Math.floor(h/HALVING_INTERVAL);
    if (era >= 64) return 0;

    return Number(INITIAL_SUBSIDY_SATS >> BigInt(era))/1e8;
  }

  function meanInterval(blocks) {
    const rows = (Array.isArray(blocks) ? blocks : [])
      .filter(b=>Number.isFinite(finite(b?.timestamp)))
      .sort((a,b)=>finite(b?.height)-finite(a?.height))
      .slice(0,10);

    const intervals=[];

    for(let i=0;i<rows.length-1;i++){
      const sec=finite(rows[i].timestamp)-finite(rows[i+1].timestamp);
      if(sec>0 && sec<7200) intervals.push(sec);
    }

    return intervals.length
      ? intervals.reduce((sum,x)=>sum+x,0)/intervals.length
      : NaN;
  }

  function merge(local, live) {
    const sourceLocal = local?.items && typeof local.items === "object"
      ? local.items
      : {};

    const pick = (key, fallback) => {
      const value = finite(sourceLocal[key]);
      return Number.isFinite(value) ? value : fallback;
    };

    return {
      updated: local?.updated || live.updated || null,
      hashrateEhs: pick("hashrate_ehs",live.hashrateEhs),
      difficulty: pick("difficulty",live.difficulty),
      blockTimeMin: pick("block_time_min",live.blockTimeMin),
      blocks24h: pick("blocks_24h",live.blocks24h),
      issuance24h: pick("issuance_btc_24h",live.issuance24h),
      subsidyBTC: pick("subsidy_btc_block",live.subsidyBTC),
      fees24h: pick("fees_btc_24h",live.fees24h),
      feeShare: pick("fee_share",live.feeShare),
      nextAdjustmentPct: pick("next_adjustment_pct",live.nextAdjustmentPct),
      nextAdjustmentBlocks: pick("next_adjustment_blocks",live.nextAdjustmentBlocks),
      nextAdjustmentEta: sourceLocal.next_adjustment_eta || live.nextAdjustmentEta || null,
      sources:live.sources
    };
  }

  W.ZZXMiningStatsModel = Object.freeze({
    __version:1,
    subsidyBTC,
    meanInterval,
    merge
  });
})();
