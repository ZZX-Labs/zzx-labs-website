// __partials/widgets/mining-rewards/js/sources.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningRewardSources?.__version >= 2) return;

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/g,"");
  }

  function mempoolBase(core) {
    return normalizeBase(
      core?.ctx?.api?.MEMPOOL ||
      core?.ctx?.api?.MEMPOOL_API ||
      W.ZZX?.api?.MEMPOOL ||
      W.ZZX?.API?.MEMPOOL ||
      "https://mempool.space/api"
    );
  }

  function list(core) {
    const base = mempoolBase(core);

    const candidates = [
      `${base}/v1/mining/pools/24h`,
      `${base}/v1/mining/pools/1d`,
      `${base}/v1/mining/pools`
    ];

    return {
      price:"/bitcoin/bpi/api/latest.json",
      pools24h:candidates,
      blockFees:`${base}/v1/mining/blocks/fees/24h`
    };
  }

  W.ZZXMiningRewardSources = Object.freeze({
    __version:2,
    list
  });
})();
