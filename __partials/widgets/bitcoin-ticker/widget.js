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
      const r = d && d.result;
      const k = r && (r.XXBTZUSD || r.XBTUSD || r.BTCUSD || r.XXBTZUSD);
      return Number(k && k.c && k.c[0]);
    },

    gemini_pubticker: d => Number(d && d.last),

    bitstamp_ticker: d => Number(d && d.last),

    bitfinex_v2_ticker: d => {
      if (Array.isArray(d)) return Number(d[6]);
      return Number(d && (d.last_price || d.last || d.price));
    },

    zzx_bpi: d => Number(
      d && (
        d.price_usd ||
        d.btc_usd ||
        d.price ||
        (d.weighted_average && d.weighted_average.price_usd) ||
        (d.global_bpi && d.global_bpi.price_usd)
      )
    )
  };

  let CONFIG = null;

  function bust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return url.startsWith("/") ? url + sep + "t=" + Date.now() : url;
  }

  async function json(url) {
    const r = await fetch(bust(url), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.json();
  }

  async function loadConfig() {
    CONFIG = {
      exchanges: await json(API.exchanges),
      currencies: await json(API.currencies),
      exchangeRates: await json(API.exchangeRates),
      assets: await json(API.assets),
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
    return config.symbols[code] || code + " ";
  }

  function labelOf(config, code) {
    return (
      (config.currencies.names && config.currencies.names[code]) ||
      (config.assets.assets && config.assets.assets[code] && config.assets.assets[code].label) ||
      code
    );
  }

  function isAssetUnit(config, code) {
    return !!(config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[code]) ||
           !!(config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[code]);
  }

  function conversionRate(config, unit) {
    if (unit === "USD") return 1;

    const fiat = Number(config.exchangeRates.rates && config.exchangeRates.rates[unit]);
    if (Number.isFinite(fiat) && fiat > 0) return fiat;

    const assetUsd = Number(config.exchangeRates.assets_usd && config.exchangeRates.assets_usd[unit]);
    if (Number.isFinite(assetUsd) && assetUsd > 0) return 1 / assetUsd;

    const commodityUsd = Number(config.exchangeRates.commodities_usd && config.exchangeRates.commodities_usd[unit]);
    if (Number.isFinite(commodityUsd) && commodityUsd > 0) return 1 / commodityUsd;

    throw new Error("missing exchange_rates value for " + unit);
  }

  async function getUsdPrice(config, sourceKey) {
    const src = config.exchanges.sources && config.exchanges.sources[sourceKey];
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

  function ensureControls(root, config) {
    const host = root.querySelector(".zzx-ticker") || root;
    let controls = root.querySelector(".ticker-controls");

    if (!controls) {
      controls = document.createElement("div");
      controls.className = "ticker-controls";
      host.insertBefore(controls, host.firstChild);
    }

    let sourceSelect = root.querySelector("[data-source-select]");
    let unitSelect = root.querySelector("[data-currency-select]");

    const oldSource = sourceSelect && sourceSelect.value;
    const oldUnit = unitSelect && unitSelect.value;

    if (!sourceSelect) {
      sourceSelect = document.createElement("select");
      sourceSelect.setAttribute("data-source-select", "");
      const label = document.createElement("label");
      label.textContent = "Source: ";
      label.appendChild(sourceSelect);
      controls.appendChild(label);
    }

    if (!unitSelect) {
      unitSelect = document.createElement("select");
      unitSelect.setAttribute("data-currency-select", "");
      const label = document.createElement("label");
      label.textContent = "Unit: ";
      label.appendChild(unitSelect);
      controls.appendChild(label);
    }

    sourceSelect.innerHTML = "";
    unitSelect.innerHTML = "";

    const sources = config.exchanges.sources || {};
    const sourceOrder = config.exchanges.order || Object.keys(sources);

    sourceOrder.forEach(key => {
      if (!sources[key]) return;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = sources[key].label || key;
      sourceSelect.appendChild(opt);
    });

    const defaultSource = config.exchanges.default || sourceOrder[0];
    sourceSelect.value = sources[oldSource] ? oldSource : defaultSource;

    const currencyOrder = config.currencies.order || [];
    currencyOrder.forEach(code => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      unitSelect.appendChild(opt);
    });

    const assetOrder = config.assets.order || [];
    assetOrder.forEach(code => {
      if (code === "BTC") return;
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelOf(config, code);
      unitSelect.appendChild(opt);
    });

    const defaultUnit = config.currencies.default || "USD";
    const allUnits = Array.from(unitSelect.options).map(o => o.value);
    unitSelect.value = allUnits.includes(oldUnit) ? oldUnit : defaultUnit;

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

  function status(root, text) {
    let el = root.querySelector("[data-ticker-status]");
    if (!el) {
      el = document.createElement("div");
      el.className = "ticker-status";
      el.setAttribute("data-ticker-status", "");
      (root.querySelector(".zzx-ticker") || root).appendChild(el);
    }
    el.textContent = text;
  }

  async function draw(root) {
    try {
      const config = CONFIG || await loadConfig();
      const controls = ensureControls(root, config);

      const source = controls.sourceSelect.value;
      const unit = controls.unitSelect.value;

      writeMarkup(root, config, unit);

      const spot = await getUsdPrice(config, source);
      const rate = conversionRate(config, unit);
      const value = spot.price_usd * rate;
      const assetMode = isAssetUnit(config, unit);

      root.querySelector("[data-btc]").textContent = fmt(value, assetMode ? 6 : 2);
      root.querySelector("[data-mbtc]").textContent = fmt(value * 1e-3, assetMode ? 8 : 2);
      root.querySelector("[data-ubtc]").textContent = fmt(value * 1e-6, assetMode ? 10 : 4);
      root.querySelector("[data-sat]").textContent = fmt(value * 1e-8, assetMode ? 12 : 6);

      status(root, `${spot.label} · ${labelOf(config, unit)} · ${config.exchangeRates.updated_at || "exchange_rates.json"}`);

      root.dataset.status = "ok";
      root.dataset.source = source;
      root.dataset.currency = unit;
    } catch (err) {
      root.dataset.status = "error";
      status(root, "ERROR: " + err.message);
    }
  }

  function boot(root) {
    if (!root) return;
    if (root.__zzxTickerTimer) clearInterval(root.__zzxTickerTimer);

    loadConfig().then(config => {
      const controls = ensureControls(root, config);
      const redraw = () => draw(root);

      controls.sourceSelect.onchange = redraw;
      controls.unitSelect.onchange = redraw;

      redraw();
      root.__zzxTickerTimer = setInterval(redraw, REFRESH_MS);
    }).catch(err => {
      status(root, "ERROR loading BPI API JSON: " + err.message);
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
