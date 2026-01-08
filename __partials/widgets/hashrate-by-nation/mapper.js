// __partials/widgets/hashrate-by-nation/mapper.js
// DROP-IN (DEBUGGED)
// Purpose:
//   Map mining pool identifiers -> nation (ISO-2)
//   This is HEURISTIC by design and intentionally conservative.
//
// Design rules:
//   - Exact matches first
//   - Substring / regex second
//   - Fallback: "Other"
//   - Never throw, never block rendering

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationMap =
    window.ZZXHashrateNationMap || {});

  // ---------------------------------------------------------------------------
  // Canonical mappings (exact, high-confidence)
  // ---------------------------------------------------------------------------
  const EXACT = {
    "Foundry USA": "US",
    "Foundry Digital": "US",
    "MARA Pool": "US",
    "Luxor": "US",
    "Luxor Mining": "US",

    "AntPool": "CN",
    "F2Pool": "CN",
    "ViaBTC": "CN",
    "Poolin": "CN",

    "Braiins Pool": "CZ",
    "SlushPool": "CZ",

    "Binance Pool": "SC",   // Seychelles (Binance legal domicile)

    "SpiderPool": "CN",
    "BTC.com": "CN",

    "Unknown": "Other",
  };

  // ---------------------------------------------------------------------------
  // Fuzzy / substring rules (lower confidence, but practical)
  // Order matters: first match wins
  // ---------------------------------------------------------------------------
  const RULES = [
    { re: /foundry/i, iso: "US" },
    { re: /mara/i, iso: "US" },
    { re: /luxor/i, iso: "US" },

    { re: /antpool/i, iso: "CN" },
    { re: /f2pool/i, iso: "CN" },
    { re: /viabtc/i, iso: "CN" },
    { re: /poolin/i, iso: "CN" },
    { re: /btc\.com/i, iso: "CN" },
    { re: /spider/i, iso: "CN" },

    { re: /slush|braiins/i, iso: "CZ" },

    { re: /binance/i, iso: "SC" },

    // Large international / ambiguous pools
    { re: /okx|okpool/i, iso: "CN" },
    { re: /huobi/i, iso: "CN" },

    // Catch common “unknown” markers
    { re: /unknown|other|solo/i, iso: "Other" },
  ];

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  NS.mapPool = function mapPool(poolName) {
    if (!poolName || typeof poolName !== "string") return "Other";

    const name = poolName.trim();

    // 1) Exact match
    if (EXACT[name]) return EXACT[name];

    const lname = name.toLowerCase();

    // 2) Fuzzy rules
    for (const rule of RULES) {
      if (rule.re.test(lname)) return rule.iso;
    }

    // 3) Final fallback
    return "Other";
  };

  // Optional helper for diagnostics / future UI
  NS._debugList = function () {
    return {
      exact: { ...EXACT },
      rules: RULES.map(r => ({ re: String(r.re), iso: r.iso })),
    };
  };
})();
