// __partials/widgets/hashrate-by-nation/sources.js
// DROP-IN
//
// PURPOSE:
// Declare the DATA INPUT CONTRACTS used by hashrate-by-nation.
// This widget DOES NOT fetch hashrate itself.
//
// REQUIRED INPUTS (provided elsewhere):
//   window.ZZXMiningStats.globalHashrateZH
//     -> Number (global hashrate in ZH/s)
//
//   window.ZZXNodesByNation
//     -> {
//          shares: { ISO: 0..1 }            // preferred
//          OR
//          byNation: { ISO: { nodes: N } }  // fallback
//        }
//
// OPTIONAL INPUTS:
//   window.ZZXPowerByNation
//     -> { ISO: { gw: Number } }            // power ceiling
//
//   window.ZZX_MINING.J_PER_TH
//     -> Number (efficiency override)
//
// OUTPUT CONSUMERS:
//   estimator.js
//   chart.js
//   table.js
//
// NO NETWORK CALLS. NO SIDE EFFECTS.

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationSources =
    window.ZZXHashrateNationSources || {});

  // ----------- REQUIRED INPUT KEYS -----------

  NS.requires = {
    globalHashrateZH: "ZZXMiningStats.globalHashrateZH",
    nodesByNation: "ZZXNodesByNation",
  };

  // ----------- OPTIONAL INPUT KEYS -----------

  NS.optional = {
    powerByNation: "ZZXPowerByNation",
    joulesPerTH: "ZZX_MINING.J_PER_TH",
  };

  // ----------- ASSUMPTIONS (DOCUMENTED) -----------

  NS.assumptions = {
    torFraction: 0.68,        // % of hashrate assumed hidden
    torMinMultiplier: 0.25,   // pessimistic redistribution
    torMaxMultiplier: 2.5,    // optimistic redistribution
    defaultJPerTH: 30,        // efficiency baseline
  };

  // ----------- STATUS HELPER -----------

  NS.ready = function ready() {
    const g = window.ZZXMiningStats?.globalHashrateZH;
    const n = window.ZZXNodesByNation;
    return Number.isFinite(g) && !!n;
  };
})();
