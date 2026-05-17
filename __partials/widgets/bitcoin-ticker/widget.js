// __partials/widgets/bitcoin-ticker/widget.js

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const REFRESH_MS = 60000;

  const API = {
    exchanges: "/bitcoin/bpi/api/exchanges.json",
    currencies: "/bitcoin/bpi/api/currencies.json",
    exchangeRates: "/bitcoin/bpi/api/exchange_rates.json",
    assets: "/bitcoin/bpi/api/assets.json",
    commodities: "/bitcoin/bpi/api/commodities.json",
    symbols: "/bitcoin/bpi/api/symbols.json"
  };

  const PARSERS = {
    coinbase_spot: d => Number(d && d.data && d.data.amount),

    kraken_ticker: d => {
      const r = d && d.result ? d.result : {};
      const k = r.XXBTZUSD || r.XBTUSD || r.BTCUSD || Object.values(r)[0];
      return Number(k && k.c && k.c[0]);
    },

    gemini_pubticker: d => Number(d && d.last),

    bitstamp_ticker: d => Number(d && d.last),

    bitfinex_v2_ticker: d => Array.isArray(d) ? Number(d[6]) : Number(d && (d.last_price || d.last || d.price)),

    zzx_bpi: d => {
      const candidates = [
        d && d.price_usd,
        d && d.btc_usd,
        d && d.price,
        d && d.vwap_usd,
        d && d.bpi_usd,
        d && d.global_price_usd,
        d && d.weighted_price_usd,
        d && d.weighted_average && d.weighted_average.price_usd,
        d && d.weighted_average && d.weighted_average.vwap_usd,
        d && d.weighted_average && d.weighted_average.price,
        d && d.global_bpi && d.global_bpi.price_usd,
        d && d.global_bpi && d.global_bpi.vwap_usd,
        d && d.data && d.data.price_usd,
        d && d.data && d.data.price,
        d && d.data && d.data.amount
      ];

      for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
      }

      return NaN;
    }
  };

  let CONFIG = null;

  function localBust(url) {
    if (!url.startsWith("/")) return url;
    return url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  async function json(url) {
    const r = await fetch(localBust(url), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.json();
  }

  async function loadConfig(force) {
    if (CONFIG && !force) return CONFIG;

    CONFIG = {
      exchanges: await json(API.exchanges),
      currencies: await json(API.currencies),
      exchangeRates: await json(API.exchangeRates),
      assets: await json(API.assets),
      commodities: await json(API.commodities),
      symbols: await json(API.symbols)
    };

    return CONFIG;
  }

  function fmt(n, digits) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function symbolOf(config, code) {
    return config.symbols && config.symbols[code] ? config.symbols[code] : code + " ";
  }

  function labelOf(config, code) {
    return (
      (config.currencies && config.currencies.names && config.currencies.names[code]) ||
      (config.assets && config.assets.assets && config.assets.assets[code] && config.assets.assets[code].label) ||
      (config.commodities && config.commodities.sources && config.commodities.sources[code] && config.commodities.sources[code].label) ||
      code
    );
  }

  function isNonFiatUnit(config, code) {
    return Boolean(
      (config.assets && config.assets.assets && config.assets.assets[code]) ||
      (config.commodities && config.commodities.sources && config.commodities.sources[code]) ||
      (config.exchangeRates && config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[code]) ||
      (config.exchangeRates && config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[code])
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

    throw new Error("missing exchange_rates value for " + unit);
  }

  async function getUsdPrice(config, sourceKey) {
    const src = config.exchanges && config.exchanges.sources && config.exchanges.sources[sourceKey];
    if (!src) throw new Error("missing exchange source " + sourceKey);

    const parser = PARSERS[src.parser];
    if (!parser) throw new Error("missing parser " + src.parser);

    const data = await json(src.url);
    const price = parser(data);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("bad price from " + (src.label || sourceKey));
    }

    return {
      price_usd: price,
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

    const oldSource = root.querySelector("[data-source-select]") && root.querySelector("[data-source-select]").value;
    const oldUnit = root.querySelector("[data-currency-select]") && root.querySelector("[data-currency-select]").value;

    controls.innerHTML = "";

    const sourceLabel = document.createElement("label");
    sourceLabel.textContent = "Source: ";

    const sourceSelect = document.createElement("select");
    sourceSelect.setAttribute("data-source-select", "");

    const sources = config.exchanges && config.exchanges.sources ? config.exchanges.sources : {};
    const sourceOrder = config.exchanges && config.exchanges.order ? config.exchanges.order : Object.keys(sources);

    sourceOrder.forEach(key => {
      const src = sources[key];
      if (!src) return;

      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = src.label || key;
      sourceSelect.appendChild(opt);
    });

    sourceSelect.value = sources[oldSource] ? oldSource : (config.exchanges.default || sourceOrder[0] || "");

    sourceLabel.appendChild(sourceSelect);
    controls.appendChild(sourceLabel);

    const unitLabel = document.createElement("label");
    unitLabel.textContent = "Unit: ";

    const unitSelect = document.createElement("select");
    unitSelect.setAttribute("data-currency-select", "");

    const added = new Set();

    (config.currencies && config.currencies.order ? config.currencies.order : []).forEach(code => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      unitSelect.appendChild(opt);
      added.add(code);
    });

    (config.assets && config.assets.order ? config.assets.order : []).forEach(code => {
      if (code === "BTC" || added.has(code)) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
      added.add(code);
    });

    Object.keys(config.commodities && config.commodities.sources ? config.commodities.sources : {}).forEach(code => {
      if (added.has(code)) return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
      added.add(code);
    });

    const allUnits = Array.from(unitSelect.options).map(o => o.value);
    unitSelect.value = allUnits.includes(oldUnit) ? oldUnit : (config.currencies.default || "USD");

    unitLabel.appendChild(unitSelect);
    controls.appendChild(unitLabel);

    return { sourceSelect, unitSelect };
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

    loadConfig(true).then(config => {
      const controls = ensureControls(root, config);
      const redraw = () => draw(root);

      controls.sourceSelect.onchange = redraw;
      controls.unitSelect.onchange = redraw;

      redraw();
      root.__zzxTickerTimer = setInterval(redraw, REFRESH_MS);
    }).catch(err => {
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
