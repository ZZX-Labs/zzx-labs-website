// __partials/widgets/mining-rewards/sources.js
// Mining Rewards sources (mempool.space via AllOrigins) + spot price sources.
// Exposes: window.ZZXMiningRewardSources.list()

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXMiningRewardSources = W.ZZXMiningRewardSources || {});

  NS.list = function list() {
    const api = W.ZZX_API || {};

    const spot =
      (typeof api.COINBASE_SPOT === "string" && api.COINBASE_SPOT.trim()) ||
      "https://api.coinbase.com/v2/prices/BTC-USD/spot";

    // Prefer mempool.space endpoints; allow you to override in ZZX_API.
    const poolsCandidates = [];
    if (typeof api.MINING_POOLS_24H === "string" && api.MINING_POOLS_24H.trim()) {
      poolsCandidates.push(api.MINING_POOLS_24H.trim());
    }
    if (Array.isArray(api.MINING_POOLS_24H_CANDIDATES)) {
      for (const u of api.MINING_POOLS_24H_CANDIDATES) {
        const s = String(u || "").trim();
        if (s) poolsCandidates.push(s);
      }
    }

    // Safe defaults (first usable wins)
    if (!poolsCandidates.length) {
      poolsCandidates.push(
        "https://mempool.space/api/v1/mining/pools/24h",
        "https://mempool.space/api/v1/mining/pools/1d",
        "https://mempool.space/api/v1/mining/pools"
      );
    }

    return {
      spot: { id: "coinbase-spot", label: "Coinbase Spot", url: spot },
      pools24h: poolsCandidates.map((u, i) => ({
        id: `pools24h-${i}`,
        label: "Mining Pools (24h)",
        url: u,
      })),
    };
  };
})();
