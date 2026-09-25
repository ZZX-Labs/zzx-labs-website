// __partials/widgets/mining-stats/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningStatsModel?.__version >= 2) return;

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

  // Live resident/direct data is authoritative.  The packaged JSON exists only
  // as a cold-start/offline fallback and must never overwrite a healthy feed.
  function merge(local, live) {
    const sourceLocal = local?.items && typeof local.items === "object" ? local.items : {};
    const pick = (liveValue,key) => {
      const l=finite(liveValue);
      if(Number.isFinite(l))return l;
      const fallback=finite(sourceLocal[key]);
      return Number.isFinite(fallback)?fallback:NaN;
    };

    return {
      updated:live?.updated || local?.updated || null,
      checkedAt:live?.checkedAt || null,
      observedAt:live?.observedAt || live?.updated || null,
      sourceUpdatedAt:live?.sourceUpdatedAt || null,
      hashrateEhs:pick(live?.hashrateEhs,"hashrate_ehs"),
      difficulty:pick(live?.difficulty,"difficulty"),
      blockTimeMin:pick(live?.blockTimeMin,"block_time_min"),
      blocks24h:pick(live?.blocks24h,"blocks_24h"),
      issuance24h:pick(live?.issuance24h,"issuance_btc_24h"),
      subsidyBTC:pick(live?.subsidyBTC,"subsidy_btc_block"),
      fees24h:pick(live?.fees24h,"fees_btc_24h"),
      feeShare:pick(live?.feeShare,"fee_share"),
      nextAdjustmentPct:pick(live?.nextAdjustmentPct,"next_adjustment_pct"),
      nextAdjustmentBlocks:pick(live?.nextAdjustmentBlocks,"next_adjustment_blocks"),
      nextAdjustmentEta:live?.nextAdjustmentEta || sourceLocal.next_adjustment_eta || null,
      sources:Array.isArray(live?.sources)?live.sources:[]
    };
  }

  W.ZZXMiningStatsModel = Object.freeze({
    __version:2,
    subsidyBTC,
    meanInterval,
    merge
  });
})();
