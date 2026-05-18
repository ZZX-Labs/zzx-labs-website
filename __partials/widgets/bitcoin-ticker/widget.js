// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
// 1s BTC exchange updates. 30m currency/commodity refresh window. WEED_LB fixed at $2,000/lb.

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";

  const BTC_REFRESH_MS = 1000;
  const FX_REFRESH_MS = 30 * 60 * 1000;
  const OIL_REFRESH_MS = 60 * 60 * 1000;
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
    },

    zzx_bpi: d => ({
      price_usd: Number(
        (d && d.price_usd) ||
        (d && d.btc_usd) ||
        (d && d.vwap_usd) ||
        (d && d.bpi_usd) ||
        (d && d.weighted_average && d.weighted_average.price_usd) ||
        (d && d.global_bpi && d.global_bpi.price_usd)
      ),
      volume_24h_btc: Number(d && d.volume_24h_btc),
      volume_24h_usd: Number(d && d.volume_24h_usd),
      high_24h: Number(d && d.high_24h),
      low_24h: Number(d && d.low_24h)
    })
  };

  let CONFIG = null;
  let BPI_CACHE = null;
  let BPI_CACHE_AT = 0;
  let EXCHANGE_RATES_CACHE_AT = 0;

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
      latest: await optionalJson(API.latest, {}),
      exchanges: await json(API.exchanges),
      currencies: await json(API.currencies),
      exchangeRates: await json(API.exchangeRates),
      assets: await json(API.assets),
      commodities: await json(API.commodities),
      symbols: await json(API.symbols),
      userValues: await optionalJson(API.userValues, { order: [], values: {} })
    };

    EXCHANGE_RATES_CACHE_AT = Date.now();
    normalizeExchangeRates(CONFIG);
    return CONFIG;
  }

  async function refreshExchangeRatesIfNeeded(config, force) {
    const now = Date.now();
    if (!force && config.exchangeRates && now - EXCHANGE_RATES_CACHE_AT < FX_REFRESH_MS) {
      return config.exchangeRates;
    }

    config.exchangeRates = await optionalJson(API.exchangeRates, config.exchangeRates || {});
    EXCHANGE_RATES_CACHE_AT = now;
    normalizeExchangeRates(config);
    return config.exchangeRates;
  }

  function normalizeExchangeRates(config) {
    if (!config.exchangeRates) config.exchangeRates = {};
    if (!config.exchangeRates.rates) config.exchangeRates.rates = {};
    if (!config.exchangeRates.assets_usd) config.exchangeRates.assets_usd = {};
    if (!config.exchangeRates.commodities_usd) config.exchangeRates.commodities_usd = {};
    if (!config.exchangeRates.user_values_usd) config.exchangeRates.user_values_usd = {};

    config.exchangeRates.rates.USD = 1;

    if (!Number(config.exchangeRates.commodities_usd.WEED_LB)) {
      config.exchangeRates.commodities_usd.WEED_LB = WEED_LB_USD;
    }

    if (!config.exchangeRates.intervals) {
      config.exchangeRates.intervals = {};
    }

    config.exchangeRates.intervals.currency_ms = FX_REFRESH_MS;
    config.exchangeRates.intervals.commodity_ms = FX_REFRESH_MS;
    config.exchangeRates.intervals.oil_ms = OIL_REFRESH_MS;
    config.exchangeRates.intervals.weed_static_usd_per_lb = WEED_LB_USD;
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

  function validParsed(p) {
    return p && Number.isFinite(Number(p.price_usd)) && Number(p.price_usd) > 0;
  }

  async function getLiveExchangeQuote(config, sourceKey) {
    const src = config.exchanges && config.exchanges.sources && config.exchanges.sources[sourceKey];
    if (!src) throw new Error("missing exchange source " + sourceKey);

    const parser = PARSERS[src.parser];
    if (!parser) throw new Error("missing parser " + src.parser);

    try {
      const raw = await json(src.url, { allowCorsProxy: !!src.cors_proxy });
      const parsed = parser(raw);

      if (!validParsed(parsed)) throw new Error("bad live parse");

      return {
        price_usd: Number(parsed.price_usd),
        volume_24h_btc: Number(parsed.volume_24h_btc || 0),
        volume_24h_usd: Number(parsed.volume_24h_usd || 0),
        high_24h: Number(parsed.high_24h || 0),
        low_24h: Number(parsed.low_24h || 0),
        label: src.label || sourceKey,
        source_key: sourceKey,
        mode: "live"
      };
    } catch (err) {
      if (src.fallback === "coingecko" && config.exchanges.sources && config.exchanges.sources.coingecko_global) {
        const cg = config.exchanges.sources.coingecko_global;
        const cgParser = PARSERS[cg.parser];
        const cgRaw = await json(cg.url, { allowCorsProxy: !!cg.cors_proxy });
        const cgParsed = cgParser(cgRaw);

        if (validParsed(cgParsed)) {
          return {
            price_usd: Number(cgParsed.price_usd),
            volume_24h_btc: Number(cgParsed.volume_24h_btc || 0),
            volume_24h_usd: Number(cgParsed.volume_24h_usd || 0),
            high_24h: Number(cgParsed.high_24h || 0),
            low_24h: Number(cgParsed.low_24h || 0),
            label: (src.label || sourceKey) + " via CoinGecko",
            source_key: sourceKey,
            mode: "fallback"
          };
        }
      }

      const latestEx = config.latest && config.latest.exchanges && config.latest.exchanges[sourceKey];
      if (latestEx && Number(latestEx.price_usd) > 0) {
        return {
          price_usd: Number(latestEx.price_usd),
          volume_24h_btc: Number(latestEx.volume_24h_btc || 0),
          volume_24h_usd: Number(latestEx.volume_24h_usd || 0),
          high_24h: Number(latestEx.high_24h || 0),
          low_24h: Number(latestEx.low_24h || 0),
          label: latestEx.label || src.label || sourceKey,
          source_key: sourceKey,
          mode: "latest.json"
        };
      }

      throw err;
    }
  }

  function quoteFromLatestBPI(config) {
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
      source_key: "zzx",
      mode: latest.mode || "latest.json"
    };
  }

  async function computeLiveBPI(config) {
    const now = Date.now();
    if (BPI_CACHE && now - BPI_CACHE_AT < BTC_REFRESH_MS) return BPI_CACHE;

    const sources = config.exchanges && config.exchanges.sources ? config.exchanges.sources : {};
    const order = config.exchanges && config.exchanges.order ? config.exchanges.order : Object.keys(sources);
    const quotes = [];

    for (const key of order) {
      if (key === "zzx" || key === "coingecko_global") continue;

      try {
        const q = await getLiveExchangeQuote(config, key);
        if (q && q.price_usd > 0) quotes.push(q);
      } catch (_) {}
    }

    const weighted = quotes.filter(q => q.volume_24h_btc > 0);
    let price = 0;
    let volume = 0;

    if (weighted.length) {
      volume = weighted.reduce((s, q) => s + q.volume_24h_btc, 0);
      price = weighted.reduce((s, q) => s + (q.price_usd * q.volume_24h_btc), 0) / volume;
    } else if (quotes.length) {
      price = quotes.reduce((s, q) => s + q.price_usd, 0) / quotes.length;
      volume = quotes.reduce((s, q) => s + q.volume_24h_btc, 0);
    }

    if (!Number.isFinite(price) || price <= 0) {
      const latestBpi = quoteFromLatestBPI(config);
      if (latestBpi) return latestBpi;
      throw new Error("ZZX Global BPI could not compute live VWAP");
    }

    const high = quotes.reduce((m, q) => q.high_24h > 0 ? Math.max(m, q.high_24h) : m, 0);
    const lowCandidates = quotes.map(q => q.low_24h).filter(v => v > 0);
    const low = lowCandidates.length ? Math.min.apply(null, lowCandidates) : 0;

    const q = {
      price_usd: price,
      volume_24h_btc: volume,
      volume_24h_usd: quotes.reduce((s, q) => s + (q.volume_24h_usd || (q.volume_24h_btc * q.price_usd)), 0),
      high_24h: high,
      low_24h: low,
      label: "ZZX Global BPI",
      source_key: "zzx",
      mode: "live-vwap",
      exchange_count: quotes.length
    };

    BPI_CACHE = q;
    BPI_CACHE_AT = now;
    return q;
  }

  async function getUsdPrice(config, sourceKey) {
    config.latest = await optionalJson(API.latest, config.latest || {});

    if (sourceKey === "zzx") {
      return await computeLiveBPI(config);
    }

    return await getLiveExchangeQuote(config, sourceKey);
  }

  function ensureStatus(root, text) {
    let el = root.querySelector("[data-ticker-status]");
    if (!el) {
      el = document.createElement("div");
      el.className = "ticker-status";
      el.setAttribute("data-ticker-status", "");
      (root.querySelector(".zzx-ticker") || root).appendChild(el);
    }
    if (text) el.textContent = text;
    return el;
  }

  function ensureControls(root, config) {
    const host = root.querySelector(".zzx-ticker") || root;
    let controls = root.querySelector(".ticker-controls");

    if (!controls) {
      controls = document.createElement("div");
      controls.className = "ticker-controls";
      host.insertBefore(controls, host.firstChild);
    }

    controls.classList.add("ticker-controls-panel");

    const oldSourceEl = root.querySelector("[data-source-select]");
    const oldUnitEl = root.querySelector("[data-currency-select]");
    const oldSource = oldSourceEl && oldSourceEl.value;
    const oldUnit = oldUnitEl && oldUnitEl.value;

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

    sourceSelect.value = sources[oldSource] ? oldSource : ((config.exchanges && config.exchanges.default) || sourceOrder[0] || "");

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

    const allUnits = Array.from(unitSelect.options).map(function (o) { return o.value; });
    unitSelect.value = allUnits.includes(oldUnit) ? oldUnit : ((config.currencies && config.currencies.default) || "USD");

    unitWrap.appendChild(unitLabel);
    unitWrap.appendChild(unitSelect);
    controls.appendChild(unitWrap);

    return { sourceSelect: sourceSelect, unitSelect: unitSelect };
  }

  function writeMarkup(root, config, unit) {
    const sym = symbolOf(config, unit);
    const label = labelOf(config, unit);

    const btcLine = root.querySelector(".btc-line");
    const units = root.querySelectorAll(".unit");

    if (btcLine) {
      btcLine.innerHTML = `[BTC]: <span data-currency-symbol>${sym}</span><span data-btc>—</span> (<span data-currency-label>${label}</span>)`;
    }

    if (units[0]) {
      units[0].innerHTML = `[mBTC]: <span data-currency-symbol>${sym}</span><span data-mbtc>—</span> (<span data-currency-label>${label}</span>)`;
    }

    if (units[1]) {
      units[1].innerHTML = `[μBTC]: <span data-currency-symbol>${sym}</span><span data-ubtc>—</span> (<span data-currency-label>${label}</span>)`;
    }

    if (units[2]) {
      units[2].innerHTML = `[sat]: <span data-currency-symbol>${sym}</span><span data-sat>—</span> (<span data-currency-label>${label}</span>)`;
    }
  }

  function formatValue(value, nonFiat, unit) {
    if (unit === "WEED_LB" || unit === "OIL_BBL") return fmt(value, 6);
    return fmt(value, nonFiat ? 8 : 2);
  }

  async function draw(root) {
    try {
      const config = CONFIG || await loadConfig(false);

      await refreshExchangeRatesIfNeeded(config, false);

      const controls = ensureControls(root, config);
      const source = controls.sourceSelect.value;
      const unit = controls.unitSelect.value;

      writeMarkup(root, config, unit);

      const spot = await getUsdPrice(config, source);
      const rate = conversionRate(config, unit);
      const value = spot.price_usd * rate;
      const nonFiat = isNonFiatUnit(config, unit);

      const btc = root.querySelector("[data-btc]");
      const mbtc = root.querySelector("[data-mbtc]");
      const ubtc = root.querySelector("[data-ubtc]");
      const sat = root.querySelector("[data-sat]");

      if (btc) btc.textContent = formatValue(value, nonFiat, unit);
      if (mbtc) mbtc.textContent = formatValue(value * 1e-3, nonFiat, unit);
      if (ubtc) ubtc.textContent = formatValue(value * 1e-6, nonFiat, unit);
      if (sat) sat.textContent = formatValue(value * 1e-8, nonFiat, unit);

      const vol = spot.volume_24h_btc > 0 ? " · Vol " + compact(spot.volume_24h_btc, 2) + " BTC" : "";
      const mode = spot.mode ? " · " + spot.mode : "";
      const updated = config.exchangeRates && config.exchangeRates.updated_at ? " · FX " + config.exchangeRates.updated_at : "";

      ensureStatus(root, `${spot.label}${mode} · ${labelOf(config, unit)}${vol}${updated}`);

      root.dataset.status = "ok";
      root.dataset.source = source;
      root.dataset.currency = unit;
    } catch (err) {
      root.dataset.status = "error";
      ensureStatus(root, "ERROR: " + err.message);
    }
  }

  function boot(root) {
    if (!root) return;
    if (root.__zzxTickerTimer) clearInterval(root.__zzxTickerTimer);

    loadConfig(true).then(function (config) {
      normalizeExchangeRates(config);

      const controls = ensureControls(root, config);
      const redraw = function () { draw(root); };

      controls.sourceSelect.onchange = redraw;
      controls.unitSelect.onchange = redraw;

      redraw();
      root.__zzxTickerTimer = setInterval(redraw, BTC_REFRESH_MS);
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
