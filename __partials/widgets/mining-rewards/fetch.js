// __partials/widgets/mining-rewards/fetch.js
// AllOrigins RAW fetch helpers + tolerant normalizers.
// Exposes: window.ZZXMiningRewardsFetch.fetchSpotUSD(core)
//          window.ZZXMiningRewardsFetch.fetchPools24h(core, candidates)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXMiningRewardsFetch = W.ZZXMiningRewardsFetch || {});
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function ao(u) {
    return AO_RAW + encodeURIComponent(String(u));
  }

  async function fetchJSON(core, url) {
    if (core && typeof core.fetchJSON === "function") {
      // core.fetchJSON SHOULD already be no-store; keep behavior consistent
      return await core.fetchJSON(url);
    }
    if (W.ZZXAO && typeof W.ZZXAO.json === "function") {
      return await W.ZZXAO.json(url);
    }
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function n2(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function normalizePoolsPayload(payload) {
    let arr = payload;

    // Common wrappers
    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      if (Array.isArray(payload.pools)) arr = payload.pools;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.items)) arr = payload.items;
      else if (Array.isArray(payload.results)) arr = payload.results;
    }
    if (!Array.isArray(arr)) return [];

    const out = [];

    for (const it of arr) {
      if (!it || typeof it !== "object") continue;

      const name = String(
        it.name ??
          it.poolName ??
          it.pool ??
          it.slug ??
          it.tag ??
          it.id ??
          "Unknown"
      ).trim() || "Unknown";

      // blocks count keys (mempool variants + generic)
      const blocks = n2(
        it.blocks ??
          it.blockCount ??
          it.count ??
          it.nBlocks ??
          it.blocksMined ??
          it.block_count ??
          it.totalBlocks
      );

      // reward keys
      let btc = n2(it.btc ?? it.rewardBtc ?? it.totalBtc ?? it.total_reward_btc);

      // sats keys
      if (!Number.isFinite(btc)) {
        const sats = n2(
          it.sats ??
            it.rewardSats ??
            it.totalSats ??
            it.total_reward_sats ??
            it.total_reward ??
            it.totalReward
        );
        if (Number.isFinite(sats)) btc = sats / 1e8;
      }

      // subsidy+fees (sats or btc)
      if (!Number.isFinite(btc)) {
        const subSats = n2(it.subsidySats ?? it.subsidy_sats ?? it.subsidy ?? it.blockSubsidy);
        const feeSats = n2(it.feesSats ?? it.fees_sats ?? it.fees ?? it.totalFees);
        const sum = (Number.isFinite(subSats) ? subSats : 0) + (Number.isFinite(feeSats) ? feeSats : 0);
        if (sum > 0) btc = sum / 1e8;
      }

      // Last resort: approximate with blocks * 3.125 (post-halving subsidy only)
      const approx = !Number.isFinite(btc) && Number.isFinite(blocks) && blocks > 0;
      if (approx) btc = blocks * 3.125;

      out.push({
        name,
        blocks: Number.isFinite(blocks) ? blocks : NaN,
        btc: Number.isFinite(btc) ? btc : NaN,
        _approx: approx,
      });
    }

    // Sort: prefer btc desc, else blocks desc
    out.sort((a, b) => {
      const ab = a.btc, bb = b.btc;
      if (Number.isFinite(bb) && Number.isFinite(ab)) return bb - ab;
      const ak = a.blocks, bk = b.blocks;
      if (Number.isFinite(bk) && Number.isFinite(ak)) return bk - ak;
      return String(a.name).localeCompare(String(b.name));
    });

    return out;
  }

  NS.fetchSpotUSD = async function fetchSpotUSD(core, url) {
    const data = await fetchJSON(core, url);
    const amt = n2(data && data.data && data.data.amount);
    if (!Number.isFinite(amt)) throw new Error("spot parse failed");
    return amt;
  };

  NS.fetchPools24h = async function fetchPools24h(core, candidates) {
    let lastErr = null;

    for (const c of (Array.isArray(candidates) ? candidates : [])) {
      const url = String(c?.url || c || "").trim();
      if (!url) continue;

      try {
        const payload = await fetchJSON(core, url);
        const rows = normalizePoolsPayload(payload);
        if (rows.length) return { rows, source: url };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("no mining source returned usable data");
  };
})();
