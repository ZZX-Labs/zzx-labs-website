// __partials/widgets/hashrate-by-nation/mapper.js
// DROP-IN (DEBUGGED + FIXED)
//
// Why your mapping “works” but still yields junk rankings:
// - Pool names rarely match EXACT keys 1:1 (punctuation, suffixes, casing, sponsor tags).
// - Some sources include "Foundry USA Pool", "Foundry USA (FPPS)", etc.
// - Your fuzzy rules had a subtle bug: you lowercased the string, then tested regexes that
//   already have /i — harmless — but you were also mixing "solo" with "Other" which
//   can collapse meaningful pools into "Other".
// - You need canonicalization + alias extraction to get stable matches.
//
// What this version does:
// - Canonicalizes pool names (trim, collapse whitespace, strip brackets, normalize punctuation)
// - Exact match uses canonical keys (so "BTC.com" vs "BTC.com Pool" can match via aliases)
// - Adds alias table + safe substring rules (non-overbroad)
// - Never throws, always returns ISO2 or "Other"
//
// Exposes:
//   window.ZZXHashrateNationMap.mapPool(name) -> ISO2|"Other"
//   window.ZZXHashrateNationMap.canon(name)   -> canonical string
//   window.ZZXHashrateNationMap._debugList()  -> mappings/rules

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationMap =
    window.ZZXHashrateNationMap || {});

  // --- helpers ---------------------------------------------------------------
  function canon(s) {
    if (!s || typeof s !== "string") return "";
    return s
      .trim()
      // remove bracketed annotations: "(FPPS)", "[EU]", etc.
      .replace(/\[[^\]]*\]|\([^\)]*\)/g, " ")
      // normalize punctuation
      .replace(/[·•|]/g, " ")
      .replace(/[’']/g, "'")
      // collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
  }

  // If the feed contains "PoolName — Something" keep left side too as an alias candidate
  function splitAliases(s) {
    const out = new Set();
    const c = canon(s);
    if (!c) return out;

    out.add(c);

    // common separators
    const parts = c.split(/\s*(?:-|—|–|:)\s*/).filter(Boolean);
    if (parts.length > 1) out.add(parts[0].trim());

    // strip trailing "pool"
    out.add(c.replace(/\s+pool$/i, "").trim());
    // strip trailing "mining"
    out.add(c.replace(/\s+mining$/i, "").trim());

    return out;
  }

  // --- canonical exact mappings ---------------------------------------------
  // Keys MUST be canonicalized strings.
  const EXACT = {
    "Foundry USA": "US",
    "Foundry Digital": "US",
    "Foundry": "US",
    "MARA Pool": "US",
    "Marathon": "US",
    "Luxor": "US",
    "Luxor Mining": "US",

    "AntPool": "CN",
    "F2Pool": "CN",
    "ViaBTC": "CN",
    "Poolin": "CN",
    "SpiderPool": "CN",
    "BTC.com": "CN",
    "BTC.com Pool": "CN",

    "Braiins Pool": "CZ",
    "Braiins": "CZ",
    "SlushPool": "CZ",
    "Slush Pool": "CZ",

    // legal domicile heuristic (you already chose this)
    "Binance Pool": "SC",
    "Binance": "SC",

    "Unknown": "Other",
    "Other": "Other",
  };

  // --- fuzzy rules -----------------------------------------------------------
  // Keep these tight; avoid classifying “solo” as Other automatically (too destructive).
  const RULES = [
    // US
    { re: /\bfoundry\b/i, iso: "US" },
    { re: /\bluxor\b/i, iso: "US" },
    { re: /\bmara\b|\bmarathon\b/i, iso: "US" },

    // CN (heuristic)
    { re: /\bantpool\b/i, iso: "CN" },
    { re: /\bf2pool\b/i, iso: "CN" },
    { re: /\bviabtc\b/i, iso: "CN" },
    { re: /\bpoolin\b/i, iso: "CN" },
    { re: /\bbtc\.com\b/i, iso: "CN" },
    { re: /\bspiderpool\b|\bspider\b/i, iso: "CN" },
    { re: /\bokx\b|\bokpool\b/i, iso: "CN" },
    { re: /\bhuobi\b/i, iso: "CN" },

    // CZ
    { re: /\bbraiins\b|\bslush\b/i, iso: "CZ" },

    // SC
    { re: /\bbinance\b/i, iso: "SC" },

    // explicit unknown markers (ONLY these words, not "solo")
    { re: /\bunknown\b|\bother\b|\bunidentified\b/i, iso: "Other" },
  ];

  // --- public API ------------------------------------------------------------
  NS.canon = canon;

  NS.mapPool = function mapPool(poolName) {
    const raw = typeof poolName === "string" ? poolName : "";
    if (!raw) return "Other";

    // 1) Try canonical exact + alias variants
    const aliases = splitAliases(raw);
    for (const a of aliases) {
      const key = canon(a);
      if (key && EXACT[key]) return EXACT[key];
    }

    // 2) Fuzzy
    const c = canon(raw);
    for (const rule of RULES) {
      if (rule.re.test(c)) return rule.iso;
    }

    return "Other";
  };

  NS._debugList = function () {
    return {
      exact: { ...EXACT },
      rules: RULES.map((r) => ({ re: String(r.re), iso: r.iso })),
    };
  };
})();
