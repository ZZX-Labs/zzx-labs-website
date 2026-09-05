// __partials/widgets/mining-rewards/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXMiningRewardsModel?.__version >= 1) return;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function build(rows, context) {
    const input = Array.isArray(rows) ? rows : [];
    const totalBlocks = input.reduce(
      (sum,row)=>sum+(Number.isFinite(finite(row.blocks)) ? finite(row.blocks) : 0),
      0
    );

    const subsidyBTC = finite(context?.subsidyBTC);
    const avgFeeBTC = Number.isFinite(finite(context?.avgFeeSats))
      ? finite(context.avgFeeSats)/1e8
      : NaN;

    const estimatedPerBlock =
      Number.isFinite(subsidyBTC)
        ? subsidyBTC + (Number.isFinite(avgFeeBTC) ? avgFeeBTC : 0)
        : NaN;

    const out = input.map(row => {
      let btc = finite(row.btc);
      let mode = row.mode || "reported";

      if (!Number.isFinite(btc) && Number.isFinite(estimatedPerBlock)) {
        btc = finite(row.blocks)*estimatedPerBlock;
        mode = Number.isFinite(avgFeeBTC) ? "subsidy+fee estimate" : "subsidy-only estimate";
      }

      return {
        name:row.name || "Unknown",
        blocks:finite(row.blocks),
        share:totalBlocks > 0 ? finite(row.blocks)/totalBlocks : NaN,
        btc,
        usd:Number.isFinite(btc) && Number.isFinite(finite(context?.priceUsd))
          ? btc*finite(context.priceUsd)
          : NaN,
        mode
      };
    });

    out.sort((a,b)=>{
      if (Number.isFinite(b.blocks) && Number.isFinite(a.blocks) && b.blocks !== a.blocks) {
        return b.blocks-a.blocks;
      }
      return String(a.name).localeCompare(String(b.name));
    });

    const totalBTC = out.reduce(
      (sum,row)=>sum+(Number.isFinite(row.btc) ? row.btc : 0),
      0
    );

    return {
      rows:out,
      totalBlocks,
      totalBTC,
      totalUSD:Number.isFinite(finite(context?.priceUsd))
        ? totalBTC*finite(context.priceUsd)
        : NaN,
      subsidyBTC,
      avgFeeSats:finite(context?.avgFeeSats),
      priceUsd:finite(context?.priceUsd)
    };
  }

  W.ZZXMiningRewardsModel = Object.freeze({
    __version:1,
    build
  });
})();
