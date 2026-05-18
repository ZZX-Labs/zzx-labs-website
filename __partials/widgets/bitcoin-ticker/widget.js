// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker — static/API driven, direct exchange source capable.

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const REFRESH_MS = 60000;

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
    coinbase_spot: d => ({ price_usd: Number(d && d.data && d.data.amount) }),
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
      volume_24h_usd: Number(d && d.volume && d.volume.USD)
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
      return {
        price_usd: Number(t.last),
        volume_24h_btc: Number(t.volCcy24h || t.vol24h),
        volume_24h_usd: Number(t.volCcy24h ? (Number(t.volCcy24h) * Number(t.last)) : t.vol24h),
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
      let weighted = 0, totalVol = 0, high = 0, low = Number.MAX_VALUE;
      tickers.forEach(t => {
        const p = Number(t && t.converted_last && t.converted_last.usd);
        const vu = Number(t && t.converted_volume && t.converted_volume.usd);
        if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(vu) || vu <= 0) return;
        const vb = vu / p;
        weighted += p * vb;
        totalVol += vb;
        high = Math.max(high, p);
        low = Math.min(low, p);
      });
      return {
        price_usd: totalVol > 0 ? weighted / totalVol : NaN,
        volume_24h_btc: totalVol,
        volume_24h_usd: weighted,
        high_24h: high,
        low_24h: low === Number.MAX_VALUE ? NaN : low
      };
    },
    zzx_bpi: d => ({
      price_usd: Number((d && d.price_usd) || (d && d.btc_usd) || (d && d.vwap_usd) || (d && d.bpi_usd) || (d && d.weighted_average && d.weighted_average.price_usd) || (d && d.global_bpi && d.global_bpi.price_usd)),
      volume_24h_btc: Number(d && d.volume_24h_btc),
      volume_24h_usd: Number(d && d.volume_24h_usd),
      high_24h: Number(d && d.high_24h),
      low_24h: Number(d && d.low_24h)
    })
  };

  let CONFIG = null;

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
    try { return await json(url); } catch (_) { return fallback; }
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
    return CONFIG;
  }

  function fmt(n, digits) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function symbolOf(config, code) {
    return (config.symbols && config.symbols[code]) || (config.userValues && config.userValues.values && config.userValues.values[code] && config.userValues.values[code].symbol) || code + " ";
  }

  function labelOf(config, code) {
    return (config.currencies && config.currencies.names && config.currencies.names[code]) ||
      (config.assets && config.assets.assets && config.assets.assets[code] && config.assets.assets[code].label) ||
      (config.commodities && config.commodities.sources && config.commodities.sources[code] && config.commodities.sources[code].label) ||
      (config.userValues && config.userValues.values && config.userValues.values[code] && config.userValues.values[code].label) ||
      code;
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
    if (unit === "USD") return 1;
    const fiat = Number(config.exchangeRates && config.exchangeRates.rates && config.exchangeRates.rates[unit]);
    if (Number.isFinite(fiat) && fiat > 0) return fiat;
    const assetUsd = Number(config.exchangeRates && config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[unit]);
    if (Number.isFinite(assetUsd) && assetUsd > 0) return 1 / assetUsd;
    const commodityUsd = Number(config.exchangeRates && config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[unit]);
    if (Number.isFinite(commodityUsd) && commodityUsd > 0) return 1 / commodityUsd;
    const userUsd = Number(config.exchangeRates && config.exchangeRates.user_values_usd && config.exchangeRates.user_values_usd[unit]);
    if (Number.isFinite(userUsd) && userUsd > 0) return 1 / userUsd;
    throw new Error("missing exchange_rates value for " + unit);
  }

  async function getUsdPrice(config, sourceKey) {
    const src = config.exchanges && config.exchanges.sources && config.exchanges.sources[sourceKey];
    if (!src) throw new Error("missing exchange source " + sourceKey);
    const parser = PARSERS[src.parser];
    if (!parser) throw new Error("missing parser " + src.parser);

    let parsed;
    try {
      const raw = await json(src.url, { allowCorsProxy: !!src.cors_proxy });
      parsed = parser(raw);
    } catch (err) {
      if (src.fallback === "coingecko" && config.exchanges.sources && config.exchanges.sources.coingecko_global) {
        const cg = config.exchanges.sources.coingecko_global;
        const cgParser = PARSERS[cg.parser];
        const cgRaw = await json(cg.url, { allowCorsProxy: !!cg.cors_proxy });
        parsed = cgParser(cgRaw);
      } else {
        throw err;
      }
    }

    const price = Number(parsed && parsed.price_usd);
    if (!Number.isFinite(price) || price <= 0) throw new Error("bad price from " + (src.label || sourceKey));

    return {
      price_usd: price,
      volume_24h_btc: Number((parsed && parsed.volume_24h_btc) || 0),
      volume_24h_usd: Number((parsed && parsed.volume_24h_usd) || 0),
      high_24h: Number((parsed && parsed.high_24h) || 0),
      low_24h: Number((parsed && parsed.low_24h) || 0),
      label: src.label || sourceKey
    };
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

    const oldSourceEl = root.querySelector("[data-source-select]");
    const oldUnitEl = root.querySelector("[data-currency-select]");
    const oldSource = oldSourceEl && oldSourceEl.value;
    const oldUnit = oldUnitEl && oldUnitEl.value;
    controls.innerHTML = "";

    const sourceLabel = document.createElement("label");
    sourceLabel.textContent = "Source: ";
    const sourceSelect = document.createElement("select");
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
    sourceLabel.appendChild(sourceSelect);
    controls.appendChild(sourceLabel);

    const unitLabel = document.createElement("label");
    unitLabel.textContent = "Unit: ";
    const unitSelect = document.createElement("select");
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
    unitLabel.appendChild(unitSelect);
    controls.appendChild(unitLabel);

    return { sourceSelect: sourceSelect, unitSelect: unitSelect };
  }

  function writeMarkup(root, config, unit) {
    const sym = symbolOf(config, unit);
    const label = labelOf(config, unit);
    const btcLine = root.querySelector(".btc-line");
    const units = root.querySelectorAll(".unit");
    if (btcLine) btcLine.innerHTML = `[BTC]: <span data-currency-symbol>${sym}</span><span data-btc>—</span> (<span data-currency-label>${label}</span>)`;
    if (units[0]) units[0].innerHTML = `[mBTC]: <span data-currency-symbol>${sym}</span><span data-mbtc>—</span> (<span data-currency-label>${label}</span>)`;
    if (units[1]) units[1].innerHTML = `[μBTC]: <span data-currency-symbol>${sym}</span><span data-ubtc>—</span> (<span data-currency-label>${label}</span>)`;
    if (units[2]) units[2].innerHTML = `[sat]: <span data-currency-symbol>${sym}</span><span data-sat>—</span> (<span data-currency-label>${label}</span>)`;
  }

  async function draw(root) {
    try {
      const config = CONFIG || await loadConfig(false);
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

      if (btc) btc.textContent = fmt(value, nonFiat ? 6 : 2);
      if (mbtc) mbtc.textContent = fmt(value * 1e-3, nonFiat ? 8 : 2);
      if (ubtc) ubtc.textContent = fmt(value * 1e-6, nonFiat ? 10 : 4);
      if (sat) sat.textContent = fmt(value * 1e-8, nonFiat ? 12 : 6);

      ensureStatus(root, `${spot.label} · ${labelOf(config, unit)} · ${config.exchangeRates && config.exchangeRates.updated_at ? config.exchangeRates.updated_at : "exchange_rates.json"}`);
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
      const controls = ensureControls(root, config);
      const redraw = function () { draw(root); };
      controls.sourceSelect.onchange = redraw;
      controls.unitSelect.onchange = redraw;
      redraw();
      root.__zzxTickerTimer = setInterval(redraw, REFRESH_MS);
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
