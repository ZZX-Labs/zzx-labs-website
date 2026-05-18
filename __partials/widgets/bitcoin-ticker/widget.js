// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
// No-flicker build v3 commodity-unit display: controls are rendered once; only numeric text nodes update per tick.
// BTC/source updates: 1s from latest.json first, direct APIs as fallback.
// FX/commodities cache: 30m. Oil metadata interval: 1h. Weed baseline: $2,000/lb.

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";

  const BTC_REFRESH_MS = 1000;
  const FX_REFRESH_MS = 30 * 60 * 1000;
  const WEED_LB_USD = 125 * 16;

  const API = {
    latest: "/bitcoin/bpi/api/latest.json",
    exchanges: "/bitcoin/bpi/api/exchanges.json",
    currencies: "/bitcoin/bpi/api/currencies.json",
    exchangeRates: "/bitcoin/bpi/api/exchange_rates.json",
    assets: "/bitcoin/bpi/api/assets.json",
    commodities: "/bitcoin/bpi/api/commodities.json",
    symbols: "/bitcoin/bpi/api/symbols.json",
    userValues: "/bitcoin/bpi/api/user_values.json"
  };

  const PARSERS = {
    coinbase_stats: d => ({
      price_usd: Number(d && d.last),
      volume_24h_btc: Number(d && d.volume),
      high_24h: Number(d && d.high),
      low_24h: Number(d && d.low)
    }),

    coinbase_spot: d => ({
      price_usd: Number(d && d.data && d.data.amount),
      volume_24h_btc: 0,
      high_24h: 0,
      low_24h: 0
    }),

    kraken_ticker: d => {
      const r = d && d.result ? d.result : {};
      const k = r.XXBTZUSD || r.XBTUSD || r.BTCUSD || Object.values(r)[0] || {};
      return {
        price_usd: Number(k && k.c && k.c[0]),
        volume_24h_btc: Number(k && k.v && k.v[1]),
        high_24h: Number(k && k.h && k.h[1]),
        low_24h: Number(k && k.l && k.l[1])
      };
    },

    gemini_pubticker: d => ({
      price_usd: Number(d && d.last),
      volume_24h_btc: Number(d && d.volume && d.volume.BTC),
      volume_24h_usd: Number(d && d.volume && d.volume.USD),
      high_24h: 0,
      low_24h: 0
    }),

    bitstamp_ticker: d => ({
      price_usd: Number(d && d.last),
      volume_24h_btc: Number(d && d.volume),
      high_24h: Number(d && d.high),
      low_24h: Number(d && d.low)
    }),

    bitfinex_v2_ticker: d => ({
      price_usd: Array.isArray(d) ? Number(d[6]) : Number(d && (d.last_price || d.last || d.price)),
      volume_24h_btc: Array.isArray(d) ? Number(d[7]) : Number(d && (d.volume || d.volume_24h_btc)),
      high_24h: Array.isArray(d) ? Number(d[8]) : Number(d && (d.high || d.high_24h)),
      low_24h: Array.isArray(d) ? Number(d[9]) : Number(d && (d.low || d.low_24h))
    }),

    okx_ticker: d => {
      const t = d && d.data && d.data[0] ? d.data[0] : {};
      const price = Number(t.last);
      const baseVol = Number(t.volCcy24h || t.vol24h);
      return {
        price_usd: price,
        volume_24h_btc: baseVol,
        volume_24h_usd: Number(t.vol24h || (baseVol && price ? baseVol * price : 0)),
        high_24h: Number(t.high24h),
        low_24h: Number(t.low24h)
      };
    },

    crypto_com_ticker: d => {
      const arr = d && d.result && d.result.data ? d.result.data : [];
      const t = arr[0] || {};
      return {
        price_usd: Number(t.a || t.last || t.price),
        volume_24h_btc: Number(t.v || t.volume),
        high_24h: Number(t.h || t.high),
        low_24h: Number(t.l || t.low)
      };
    },

    kucoin_stats: d => {
      const t = d && d.data ? d.data : {};
      return {
        price_usd: Number(t.last),
        volume_24h_btc: Number(t.vol),
        volume_24h_usd: Number(t.volValue),
        high_24h: Number(t.high),
        low_24h: Number(t.low)
      };
    },

    gateio_ticker: d => {
      const t = Array.isArray(d) ? (d[0] || {}) : (d || {});
      return {
        price_usd: Number(t.last),
        volume_24h_btc: Number(t.base_volume),
        volume_24h_usd: Number(t.quote_volume),
        high_24h: Number(t.high_24h),
        low_24h: Number(t.low_24h)
      };
    },

    bitget_ticker: d => {
      const arr = d && d.data ? d.data : [];
      const t = Array.isArray(arr) ? (arr[0] || {}) : arr;
      return {
        price_usd: Number(t.lastPr || t.close || t.last),
        volume_24h_btc: Number(t.baseVolume || t.baseVol),
        volume_24h_usd: Number(t.quoteVolume || t.usdtVolume),
        high_24h: Number(t.high24h || t.high),
        low_24h: Number(t.low24h || t.low)
      };
    },

    mexc_24hr: d => ({
      price_usd: Number(d && d.lastPrice),
      volume_24h_btc: Number(d && d.volume),
      volume_24h_usd: Number(d && d.quoteVolume),
      high_24h: Number(d && d.highPrice),
      low_24h: Number(d && d.lowPrice)
    }),

    htx_merged: d => {
      const t = d && d.tick ? d.tick : {};
      return {
        price_usd: Number(t.close),
        volume_24h_btc: Number(t.amount),
        volume_24h_usd: Number(t.vol),
        high_24h: Number(t.high),
        low_24h: Number(t.low)
      };
    },

    okcoin_ticker: d => ({
      price_usd: Number(d && d.last),
      volume_24h_btc: Number(d && d.base_volume_24h),
      volume_24h_usd: Number(d && d.quote_volume_24h),
      high_24h: Number(d && d.high_24h),
      low_24h: Number(d && d.low_24h)
    }),

    binance_24hr: d => ({
      price_usd: Number(d && d.lastPrice),
      volume_24h_btc: Number(d && d.volume),
      volume_24h_usd: Number(d && d.quoteVolume),
      high_24h: Number(d && d.highPrice),
      low_24h: Number(d && d.lowPrice)
    }),

    coingecko_bitcoin_tickers: d => {
      const tickers = d && d.tickers ? d.tickers : [];
      let weighted = 0;
      let totalVol = 0;
      let volUsd = 0;
      let high = 0;
      let low = Number.MAX_VALUE;

      tickers.forEach(t => {
        const p = Number(t && t.converted_last && t.converted_last.usd);
        const vu = Number(t && t.converted_volume && t.converted_volume.usd);
        if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(vu) || vu <= 0) return;

        const vb = vu / p;
        weighted += p * vb;
        totalVol += vb;
        volUsd += vu;
        high = Math.max(high, p);
        low = Math.min(low, p);
      });

      return {
        price_usd: totalVol > 0 ? weighted / totalVol : NaN,
        volume_24h_btc: totalVol,
        volume_24h_usd: volUsd,
        high_24h: high,
        low_24h: low === Number.MAX_VALUE ? NaN : low
      };
    }
  };

  let CONFIG = null;
  let CONFIG_READY_AT = 0;
  let FX_READY_AT = 0;
  let LATEST_CACHE = {};
  let LATEST_CACHE_AT = 0;

  function localBust(url) {
    if (!url || !url.startsWith("/")) return url;
    return url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  function allOriginsRaw(url) {
    return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  }

  async function fetchJsonDirect(url) {
    const r = await fetch(localBust(url), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.json();
  }

  async function json(url, opts) {
    opts = opts || {};
    try {
      return await fetchJsonDirect(url);
    } catch (err) {
      if (opts.allowCorsProxy && url && !url.startsWith("/")) {
        return await fetchJsonDirect(allOriginsRaw(url));
      }
      throw err;
    }
  }

  async function optionalJson(url, fallback) {
    try {
      return await json(url);
    } catch (_) {
      return fallback;
    }
  }

  async function loadConfig(force) {
    if (CONFIG && !force) return CONFIG;

    CONFIG = {
      exchanges: await json(API.exchanges),
      currencies: await json(API.currencies),
      exchangeRates: await json(API.exchangeRates),
      assets: await json(API.assets),
      commodities: await json(API.commodities),
      symbols: await json(API.symbols),
      userValues: await optionalJson(API.userValues, { order: [], values: {} })
    };

    CONFIG_READY_AT = Date.now();
    FX_READY_AT = CONFIG_READY_AT;
    normalizeExchangeRates(CONFIG);
    return CONFIG;
  }

  async function refreshFxIfNeeded(config, force) {
    const now = Date.now();
    if (!force && config.exchangeRates && now - FX_READY_AT < FX_REFRESH_MS) {
      normalizeExchangeRates(config);
      return;
    }

    config.exchangeRates = await optionalJson(API.exchangeRates, config.exchangeRates || {});
    FX_READY_AT = now;
    normalizeExchangeRates(config);
  }

  async function refreshLatest(config) {
    const now = Date.now();
    if (LATEST_CACHE && now - LATEST_CACHE_AT < BTC_REFRESH_MS) {
      config.latest = LATEST_CACHE;
      return;
    }

    LATEST_CACHE = await optionalJson(API.latest, LATEST_CACHE || {});
    LATEST_CACHE_AT = now;
    config.latest = LATEST_CACHE;
  }

  function normalizeExchangeRates(config) {
    if (!config.exchangeRates) config.exchangeRates = {};
    if (!config.exchangeRates.rates) config.exchangeRates.rates = {};
    if (!config.exchangeRates.assets_usd) config.exchangeRates.assets_usd = {};
    if (!config.exchangeRates.commodities_usd) config.exchangeRates.commodities_usd = {};
    if (!config.exchangeRates.user_values_usd) config.exchangeRates.user_values_usd = {};

    config.exchangeRates.rates.USD = 1;
    config.exchangeRates.commodities_usd.WEED_LB = WEED_LB_USD;
  }

  function fmt(n, digits) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function compact(n, digits) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-US", {
      notation: "compact",
      maximumFractionDigits: digits == null ? 2 : digits
    });
  }

  function symbolOf(config, code) {
    return (
      (config.symbols && config.symbols[code]) ||
      (config.userValues && config.userValues.values && config.userValues.values[code] && config.userValues.values[code].symbol) ||
      code + " "
    );
  }

  function labelOf(config, code) {
    return (
      (config.currencies && config.currencies.names && config.currencies.names[code]) ||
      (config.assets && config.assets.assets && config.assets.assets[code] && config.assets.assets[code].label) ||
      (config.commodities && config.commodities.sources && config.commodities.sources[code] && config.commodities.sources[code].label) ||
      (config.userValues && config.userValues.values && config.userValues.values[code] && config.userValues.values[code].label) ||
      code
    );
  }

  function isNonFiatUnit(config, code) {
    return Boolean(
      (config.assets && config.assets.assets && config.assets.assets[code]) ||
      (config.commodities && config.commodities.sources && config.commodities.sources[code]) ||
      (config.userValues && config.userValues.values && config.userValues.values[code]) ||
      (config.exchangeRates && config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[code]) ||
      (config.exchangeRates && config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[code]) ||
      (config.exchangeRates && config.exchangeRates.user_values_usd && config.exchangeRates.user_values_usd[code])
    ) && code !== "BTC";
  }

  function conversionRate(config, unit) {
    normalizeExchangeRates(config);

    if (unit === "USD") return 1;

    const fiat = Number(config.exchangeRates.rates && config.exchangeRates.rates[unit]);
    if (Number.isFinite(fiat) && fiat > 0) return fiat;

    const assetUsd = Number(config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[unit]);
    if (Number.isFinite(assetUsd) && assetUsd > 0) return 1 / assetUsd;

    const commodityUsd = Number(config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[unit]);
    if (Number.isFinite(commodityUsd) && commodityUsd > 0) return 1 / commodityUsd;

    const userUsd = Number(config.exchangeRates.user_values_usd && config.exchangeRates.user_values_usd[unit]);
    if (Number.isFinite(userUsd) && userUsd > 0) return 1 / userUsd;

    throw new Error("missing exchange_rates value for " + unit);
  }

  function latestBpiQuote(config) {
    const latest = config.latest || {};
    const price = Number(
      latest.price_usd ||
      latest.btc_usd ||
      latest.vwap_usd ||
      latest.bpi_usd ||
      (latest.weighted_average && latest.weighted_average.price_usd) ||
      (latest.global_bpi && latest.global_bpi.price_usd)
    );

    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      price_usd: price,
      volume_24h_btc: Number(latest.volume_24h_btc || 0),
      volume_24h_usd: Number(latest.volume_24h_usd || 0),
      high_24h: Number(latest.high_24h || 0),
      low_24h: Number(latest.low_24h || 0),
      label: "ZZX Global BPI",
      mode: latest.mode || "latest.json"
    };
  }

  function latestExchangeQuote(config, sourceKey) {
    const latest = config.latest || {};
    const ex = latest.exchanges && latest.exchanges[sourceKey];

    if (!ex) return null;

    const price = Number(ex.price_usd);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      price_usd: price,
      volume_24h_btc: Number(ex.volume_24h_btc || 0),
      volume_24h_usd: Number(ex.volume_24h_usd || 0),
      high_24h: Number(ex.high_24h || 0),
      low_24h: Number(ex.low_24h || 0),
      label: ex.label || sourceKey,
      mode: "latest.json"
    };
  }

  function validParsed(p) {
    return p && Number.isFinite(Number(p.price_usd)) && Number(p.price_usd) > 0;
  }

  async function liveExchangeQuote(config, sourceKey) {
    const src = config.exchanges && config.exchanges.sources && config.exchanges.sources[sourceKey];
    if (!src) throw new Error("missing exchange source " + sourceKey);

    const parser = PARSERS[src.parser];
    if (!parser) throw new Error("missing parser " + src.parser);

    const raw = await json(src.url, { allowCorsProxy: !!src.cors_proxy });
    const parsed = parser(raw);

    if (!validParsed(parsed)) throw new Error("bad live parse from " + (src.label || sourceKey));

    return {
      price_usd: Number(parsed.price_usd),
      volume_24h_btc: Number(parsed.volume_24h_btc || 0),
      volume_24h_usd: Number(parsed.volume_24h_usd || 0),
      high_24h: Number(parsed.high_24h || 0),
      low_24h: Number(parsed.low_24h || 0),
      label: src.label || sourceKey,
      mode: "live"
    };
  }

  async function sourceQuote(config, sourceKey) {
    await refreshLatest(config);

    if (sourceKey === "zzx") {
      const bpi = latestBpiQuote(config);
      if (bpi) return bpi;
    }

    try {
      return await liveExchangeQuote(config, sourceKey);
    } catch (_) {
      const fromLatest = latestExchangeQuote(config, sourceKey);
      if (fromLatest) return fromLatest;

      const src = config.exchanges && config.exchanges.sources && config.exchanges.sources[sourceKey];
      if (src && src.fallback === "coingecko" && config.exchanges.sources.coingecko_global) {
        return await liveExchangeQuote(config, "coingecko_global");
      }

      throw _;
    }
  }

  function ensureControls(root, config) {
    const host = root.querySelector(".zzx-ticker") || root;
    let controls = root.querySelector(".ticker-controls");

    if (!controls) {
      controls = document.createElement("div");
      controls.className = "ticker-controls ticker-controls-panel";
      host.insertBefore(controls, host.firstChild);
    }

    if (controls.__zzxBuilt) {
      return {
        sourceSelect: root.querySelector("[data-source-select]"),
        unitSelect: root.querySelector("[data-currency-select]")
      };
    }

    controls.className = "ticker-controls ticker-controls-panel";
    controls.innerHTML = "";

    const sourceWrap = document.createElement("div");
    sourceWrap.className = "ticker-control-group ticker-control-source";

    const sourceLabel = document.createElement("label");
    sourceLabel.className = "ticker-control-label";
    sourceLabel.textContent = "SRC";

    const sourceSelect = document.createElement("select");
    sourceSelect.className = "ticker-control-select";
    sourceSelect.setAttribute("data-source-select", "");

    const sources = (config.exchanges && config.exchanges.sources) || {};
    const sourceOrder = (config.exchanges && config.exchanges.order) || Object.keys(sources);

    sourceOrder.forEach(function (key) {
      const src = sources[key];
      if (!src) return;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = src.label || key;
      sourceSelect.appendChild(opt);
    });

    sourceSelect.value = (config.exchanges && config.exchanges.default) || sourceOrder[0] || "";

    sourceWrap.appendChild(sourceLabel);
    sourceWrap.appendChild(sourceSelect);
    controls.appendChild(sourceWrap);

    const unitWrap = document.createElement("div");
    unitWrap.className = "ticker-control-group ticker-control-unit";

    const unitLabel = document.createElement("label");
    unitLabel.className = "ticker-control-label";
    unitLabel.textContent = "UNIT";

    const unitSelect = document.createElement("select");
    unitSelect.className = "ticker-control-select";
    unitSelect.setAttribute("data-currency-select", "");

    const added = new Set();

    ((config.currencies && config.currencies.order) || []).forEach(function (code) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      unitSelect.appendChild(opt);
      added.add(code);
    });

    ((config.assets && config.assets.order) || []).forEach(function (code) {
      if (code === "BTC" || added.has(code)) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
      added.add(code);
    });

    Object.keys((config.commodities && config.commodities.sources) || {}).forEach(function (code) {
      if (added.has(code)) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
      added.add(code);
    });

    ((config.userValues && config.userValues.order) || []).forEach(function (code) {
      if (added.has(code)) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
      added.add(code);
    });

    unitSelect.value = (config.currencies && config.currencies.default) || "USD";

    unitWrap.appendChild(unitLabel);
    unitWrap.appendChild(unitSelect);
    controls.appendChild(unitWrap);

    controls.__zzxBuilt = true;

    return { sourceSelect: sourceSelect, unitSelect: unitSelect };
  }

  function setText(root, selector, value) {
    const el = root.querySelector(selector);
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }

  function ensureValueMarkup(root) {
    const btcLine = root.querySelector(".btc-line");
    const units = root.querySelectorAll(".unit");

    if (btcLine && !btcLine.querySelector("[data-btc]")) {
      btcLine.innerHTML = '[BTC]: <span data-currency-symbol></span><span data-btc>—</span> (<span data-currency-label></span>)';
    }

    if (units[0] && !units[0].querySelector("[data-mbtc]")) {
      units[0].innerHTML = '[mBTC]: <span data-currency-symbol></span><span data-mbtc>—</span> (<span data-currency-label></span>)';
    }

    if (units[1] && !units[1].querySelector("[data-ubtc]")) {
      units[1].innerHTML = '[μBTC]: <span data-currency-symbol></span><span data-ubtc>—</span> (<span data-currency-label></span>)';
    }

    if (units[2] && !units[2].querySelector("[data-sat]")) {
      units[2].innerHTML = '[sat]: <span data-currency-symbol></span><span data-sat>—</span> (<span data-currency-label></span>)';
    }
  }

  const TROY_OZ_TO_G = 31.1034768;
  const LB_TO_OZ = 16;
  const LB_TO_G = 453.59237;
  const WEED_LB_TO_G = 448;
  const OIL_BBL_TO_GAL = 42;
  const OIL_GAL_TO_PT = 8;
  const OIL_BBL_TO_ML = 158987.294928;

  function unitLabel(value, singular, plural) {
    const x = Math.abs(Number(value));
    return x === 1 ? singular : plural;
  }

  function denomMeta(config, unit, denom, btcQuantity) {
    const scale = denom === "BTC" ? 1 : denom === "mBTC" ? 1e-3 : denom === "μBTC" ? 1e-6 : 1e-8;
    const q = btcQuantity * scale;

    if (unit === "WEED_LB") {
      if (denom === "BTC") return { value: q, symbol: "", label: unitLabel(q, "lB", "lBs"), digits: 8 };
      if (denom === "mBTC") return { value: q * LB_TO_OZ, symbol: "", label: unitLabel(q * LB_TO_OZ, "oz", "OZs"), digits: 12 };
      if (denom === "μBTC") return { value: q * WEED_LB_TO_G, symbol: "", label: unitLabel(q * WEED_LB_TO_G, "g", "gs"), digits: 16 };
      return { value: q * WEED_LB_TO_G * 1000, symbol: "", label: unitLabel(q * WEED_LB_TO_G * 1000, "mg", "mgs"), digits: 24 };
    }

    if (unit === "OIL_BBL") {
      if (denom === "BTC") return { value: q, symbol: "", label: unitLabel(q, "barrel", "barrels"), digits: 8 };
      if (denom === "mBTC") return { value: (q * OIL_BBL_TO_GAL) / 5, symbol: "", label: unitLabel((q * OIL_BBL_TO_GAL) / 5, "5 gallon", "5 gallons"), digits: 12 };
      if (denom === "μBTC") return { value: q * OIL_BBL_TO_GAL * OIL_GAL_TO_PT, symbol: "", label: unitLabel(q * OIL_BBL_TO_GAL * OIL_GAL_TO_PT, "pint", "pints"), digits: 16 };
      return { value: q * OIL_BBL_TO_ML, symbol: "", label: "mL", digits: 24 };
    }

    if (unit === "XCU") {
      if (denom === "BTC") return { value: q, symbol: "", label: unitLabel(q, "lB copper", "lBs copper"), digits: 8 };
      if (denom === "mBTC") return { value: q * LB_TO_OZ, symbol: "", label: unitLabel(q * LB_TO_OZ, "oz copper", "OZs copper"), digits: 12 };
      if (denom === "μBTC") return { value: q * LB_TO_G, symbol: "", label: unitLabel(q * LB_TO_G, "g copper", "gs copper"), digits: 16 };
      return { value: q * LB_TO_G * 1000, symbol: "", label: unitLabel(q * LB_TO_G * 1000, "mg copper", "mgs copper"), digits: 24 };
    }

    if (unit === "XAU" || unit === "XPT" || unit === "XPD") {
      const metal = unit === "XAU" ? "gold" : unit === "XPT" ? "platinum" : "palladium";
      if (denom === "BTC") return { value: q, symbol: "", label: unitLabel(q, "oz " + metal, "OZs " + metal), digits: 8 };
      if (denom === "sat") return { value: q * TROY_OZ_TO_G * 1000, symbol: "", label: unitLabel(q * TROY_OZ_TO_G * 1000, "mg " + metal, "mgs " + metal), digits: 24 };
      return { value: q * TROY_OZ_TO_G, symbol: "", label: unitLabel(q * TROY_OZ_TO_G, "g " + metal, "gs " + metal), digits: 16 };
    }

    if (unit === "XAG") {
      if (denom === "BTC" || denom === "mBTC") return { value: q, symbol: "", label: unitLabel(q, "oz silver", "OZs silver"), digits: denom === "BTC" ? 8 : 12 };
      if (denom === "μBTC") return { value: q * TROY_OZ_TO_G, symbol: "", label: unitLabel(q * TROY_OZ_TO_G, "g silver", "gs silver"), digits: 16 };
      return { value: q * TROY_OZ_TO_G * 1000, symbol: "", label: unitLabel(q * TROY_OZ_TO_G * 1000, "mg silver", "mgs silver"), digits: 24 };
    }

    return {
      value: q,
      symbol: symbolOf(config, unit),
      label: labelOf(config, unit),
      digits: isNonFiatUnit(config, unit)
        ? (denom === "BTC" ? 8 : denom === "mBTC" ? 12 : denom === "μBTC" ? 16 : 24)
        : (denom === "BTC" ? 2 : denom === "mBTC" ? 4 : denom === "μBTC" ? 8 : 12)
    };
  }

  function updateDenomLabels(root, metas) {
    const btcLine = root.querySelector(".btc-line");
    const units = root.querySelectorAll(".unit");
    const rows = [
      { host: btcLine, meta: metas.btc },
      { host: units[0], meta: metas.mbtc },
      { host: units[1], meta: metas.ubtc },
      { host: units[2], meta: metas.sat }
    ];

    rows.forEach(function(row) {
      if (!row.host || !row.meta) return;
      const sym = row.host.querySelector("[data-currency-symbol]");
      const lab = row.host.querySelector("[data-currency-label]");
      if (sym && sym.textContent !== row.meta.symbol) sym.textContent = row.meta.symbol;
      if (lab && lab.textContent !== row.meta.label) lab.textContent = row.meta.label;
    });
  }

  function formatDenom(meta) {
    return fmt(meta.value, meta.digits);
  }

  function ensureStatus(root, text) {
    let el = root.querySelector("[data-ticker-status]");

    if (!el) {
      el = document.createElement("div");
      el.className = "ticker-status";
      el.setAttribute("data-ticker-status", "");
      (root.querySelector(".zzx-ticker") || root).appendChild(el);
    }

    if (text && el.textContent !== text) {
      el.textContent = text;
    }

    return el;
  }

  async function draw(root) {
    try {
      const config = CONFIG || await loadConfig(false);
      await refreshFxIfNeeded(config, false);

      const controls = ensureControls(root, config);
      const source = controls.sourceSelect.value;
      const unit = controls.unitSelect.value;

      ensureValueMarkup(root);

      const spot = await sourceQuote(config, source);
      const rate = conversionRate(config, unit);
      const btcQuantity = spot.price_usd * rate;

      const metas = {
        btc: denomMeta(config, unit, "BTC", btcQuantity),
        mbtc: denomMeta(config, unit, "mBTC", btcQuantity),
        ubtc: denomMeta(config, unit, "μBTC", btcQuantity),
        sat: denomMeta(config, unit, "sat", btcQuantity)
      };

      updateDenomLabels(root, metas);

      setText(root, "[data-btc]", formatDenom(metas.btc));
      setText(root, "[data-mbtc]", formatDenom(metas.mbtc));
      setText(root, "[data-ubtc]", formatDenom(metas.ubtc));
      setText(root, "[data-sat]", formatDenom(metas.sat));

      const vol = spot.volume_24h_btc > 0 ? " · Vol " + compact(spot.volume_24h_btc, 2) + " BTC" : "";
      const mode = spot.mode ? " · " + spot.mode : "";
      const fx = config.exchangeRates && config.exchangeRates.updated_at ? " · FX " + config.exchangeRates.updated_at : "";

      ensureStatus(root, `${spot.label}${mode} · ${labelOf(config, unit)}${vol}${fx}`);

      if (root.__zzxStatus !== "ok") {
        root.dataset.status = "ok";
        root.__zzxStatus = "ok";
      }
    } catch (err) {
      if (root.__zzxStatus !== "error") {
        root.dataset.status = "error";
        root.__zzxStatus = "error";
      }
      ensureStatus(root, "ERROR: " + err.message);
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxTickerTimer) {
      clearTimeout(root.__zzxTickerTimer);
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    root.__zzxDrawing = false;
    root.__zzxDrawQueued = false;

    function queueDraw() {
      if (root.__zzxDrawing) {
        root.__zzxDrawQueued = true;
        return;
      }

      root.__zzxDrawing = true;

      Promise.resolve(draw(root))
        .catch(function (_) {})
        .finally(function () {
          root.__zzxDrawing = false;

          if (root.__zzxDrawQueued) {
            root.__zzxDrawQueued = false;
            queueDraw();
          }
        });
    }

    function tickLoop() {
      queueDraw();
      root.__zzxTickerTimer = setTimeout(tickLoop, BTC_REFRESH_MS);
    }

    loadConfig(true).then(function (config) {
      normalizeExchangeRates(config);
      ensureControls(root, config);
      ensureValueMarkup(root);

      const controls = ensureControls(root, config);

      if (controls.sourceSelect) {
        controls.sourceSelect.addEventListener("change", function () {
          LATEST_CACHE_AT = 0;
          queueDraw();
        });
      }

      if (controls.unitSelect) {
        controls.unitSelect.addEventListener("change", function () {
          queueDraw();
        });
      }

      queueDraw();
      root.__zzxTickerTimer = setTimeout(tickLoop, BTC_REFRESH_MS);
    }).catch(function (err) {
      ensureStatus(root, "ERROR loading /bitcoin/bpi/api JSON: " + err.message);
    });
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, boot);
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, boot);
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll('[data-widget="bitcoin-ticker"], .ticker-shell').forEach(boot);
  });
})();
