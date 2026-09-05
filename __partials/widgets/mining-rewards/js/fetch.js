// __partials/widgets/mining-rewards/js/fetch.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningRewardsFetch?.__version >= 2) return;

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function isExternal(url) {
    return /^https?:\/\//i.test(String(url || ""));
  }

  async function rawJSON(url, allowProxy=true) {
    const external = isExternal(url);

    async function direct(target) {
      if (W.ZZXAPI?.jsonStrict) {
        return await W.ZZXAPI.jsonStrict(target,{
          cacheBust:!external,
          timeoutMs:10000,
          retries:1
        });
      }

      if (W.ZZXAPI?.fetchRaw) {
        const r = await W.ZZXAPI.fetchRaw(target,{
          cacheBust:!external,
          cache:"no-store",
          credentials:external ? "omit" : "same-origin",
          timeoutMs:10000,
          retries:1,
          retryDelayMs:450
        });
        return await r.json();
      }

      const r = await fetch(target,{
        cache:"no-store",
        credentials:external ? "omit" : "same-origin"
      });

      if (!r.ok) {
        const error = new Error(`HTTP ${r.status} ${target}`);
        error.status = r.status;
        throw error;
      }

      return await r.json();
    }

    try {
      return await direct(url);
    } catch (error) {
      if (!external || !allowProxy || Number(error?.status) >= 400) throw error;
      return await direct(AO_RAW + encodeURIComponent(url));
    }
  }

  function poolName(item) {
    const pool = item?.pool && typeof item.pool === "object" ? item.pool : null;

    return String(
      item?.name ??
      item?.poolName ??
      pool?.name ??
      item?.slug ??
      pool?.slug ??
      item?.tag ??
      item?.id ??
      "Unknown"
    ).trim() || "Unknown";
  }

  function parseBTCReward(item) {
    const direct = finite(
      item?.btc ??
      item?.rewardBtc ??
      item?.totalBtc ??
      item?.total_reward_btc
    );
    if (Number.isFinite(direct)) return {btc:direct, mode:"reported"};

    const sats = finite(
      item?.sats ??
      item?.rewardSats ??
      item?.totalSats ??
      item?.total_reward_sats ??
      item?.total_reward ??
      item?.totalReward
    );
    if (Number.isFinite(sats)) return {btc:sats/1e8, mode:"reported"};

    const subSats = finite(
      item?.subsidySats ??
      item?.subsidy_sats ??
      item?.subsidy ??
      item?.blockSubsidy
    );
    const feeSats = finite(
      item?.feesSats ??
      item?.fees_sats ??
      item?.fees ??
      item?.totalFees
    );

    if (Number.isFinite(subSats) || Number.isFinite(feeSats)) {
      return {
        btc:(
          (Number.isFinite(subSats) ? subSats : 0) +
          (Number.isFinite(feeSats) ? feeSats : 0)
        )/1e8,
        mode:"reported"
      };
    }

    return {btc:NaN,mode:"estimate"};
  }

  function normalizePools(payload) {
    let arr = payload;

    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      arr =
        (Array.isArray(payload.pools) && payload.pools) ||
        (Array.isArray(payload.data) && payload.data) ||
        (Array.isArray(payload.items) && payload.items) ||
        (Array.isArray(payload.results) && payload.results) ||
        [];
    }

    if (!Array.isArray(arr)) return [];

    return arr.map(item => {
      const blocks = finite(
        item?.blocks ??
        item?.blockCount ??
        item?.count ??
        item?.nBlocks ??
        item?.blocksMined ??
        item?.block_count ??
        item?.totalBlocks
      );

      const reward = parseBTCReward(item);

      return {
        name:poolName(item),
        blocks:Number.isFinite(blocks) ? blocks : NaN,
        btc:reward.btc,
        mode:reward.mode
      };
    }).filter(row => Number.isFinite(row.blocks) && row.blocks >= 0);
  }

  async function fetchPools(candidates) {
    let lastError=null;

    for (const url of candidates || []) {
      try {
        const payload = await rawJSON(url,true);
        const rows = normalizePools(payload);
        if (rows.length) return {rows,source:url};
      } catch (error) {
        lastError=error;
      }
    }

    throw lastError || new Error("no usable mining-pool source");
  }

  async function fetchPrice(url) {
    const data = await rawJSON(url,false);

    const price = finite(
      data?.price_usd ??
      data?.bpi_usd ??
      data?.vwap_usd ??
      data?.price
    );

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("local BPI price unavailable");
    }

    return {
      price,
      source:data?.source || "ZZX Global BPI"
    };
  }

  async function fetchFeeSummary(url) {
    try {
      const data = await rawJSON(url,true);

      const direct = finite(
        data?.avgFeesPerBlockSats ??
        data?.meanFeesPerBlockSats ??
        data?.avg_fees_per_block_sats
      );

      if (Number.isFinite(direct) && direct >= 0) {
        return {avgFeeSats:direct,source:url};
      }

      if (Array.isArray(data)) {
        const values = data
          .map(row=>finite(
            row?.avgFees ??
            row?.fees ??
            row?.totalFees ??
            row?.feesSats
          ))
          .filter(v=>Number.isFinite(v) && v>=0);

        if (values.length) {
          return {
            avgFeeSats:values.reduce((a,b)=>a+b,0)/values.length,
            source:url
          };
        }
      }
    } catch (_) {}

    return {avgFeeSats:NaN,source:""};
  }

  W.ZZXMiningRewardsFetch = Object.freeze({
    __version:2,
    rawJSON,
    normalizePools,
    fetchPools,
    fetchPrice,
    fetchFeeSummary
  });
})();
