// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
// Fully API-driven from /bitcoin/bpi/api/*.json

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const REFRESH_MS = 60000;

  const API = {
    exchanges: "/bitcoin/bpi/api/exchanges.json",
    currencies: "/bitcoin/bpi/api/currencies.json",
    exchangeRates: "/bitcoin/bpi/api/exchange_rates.json",
    commodities: "/bitcoin/bpi/api/commodities.json",
    assets: "/bitcoin/bpi/api/assets.json",
    symbols: "/bitcoin/bpi/api/symbols.json"
  };

  const PARSERS = {
    coinbase_spot: d => Number(d && d.data && d.data.amount),
    kraken_ticker: d => {
      const r = d && d.result;
      const k = r && (r.XXBTZUSD || r.XBTUSD || r.BTCUSD);
      return Number(k && k.c && k.c[0]);
    },
    gemini_pubticker: d => Number(d && d.last),
    bitstamp_ticker: d => Number(d && d.last),
    bitfinex_v2_ticker: d => Array.isArray(d) ? Number(d[6]) : NaN,
    zzx_bpi: d => Number(d && (d.price_usd || d.btc_usd || d.price))
  };

  let CONFIG_CACHE = null;

  async function json(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.json();
  }

  async function loadConfig() {
    if (CONFIG_CACHE) return CONFIG_CACHE;

    CONFIG_CACHE = {
      exchanges: await json(API.exchanges),
      currencies: await json(API.currencies),
      exchangeRates: await json(API.exchangeRates),
      commodities: await json(API.commodities),
      assets: await json(API.assets),
      symbols: await json(API.symbols)
    };

    return CONFIG_CACHE;
  }

  function fmt(n, digits) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function getSymbol(config, code) {
    return config.symbols[code] || code + " ";
  }

  function getLabel(config, code) {
    return (
      config.currencies.names?.[code] ||
      config.assets.assets?.[code]?.label ||
      code
    );
  }

  function isAsset(config, code) {
    return !!config.assets.assets?.[code] && code !== "BTC";
  }

  function getConversionRate(config, unit) {
    if (unit === "USD") return 1;

    const fiatRate = Number(config.exchangeRates.rates?.[unit]);
    if (Number.isFinite(fiatRate) && fiatRate > 0) return fiatRate;

    const usdPerAsset = Number(config.exchangeRates.assets_usd?.[unit]);
    if (Number.isFinite(usdPerAsset) && usdPerAsset > 0) return 1 / usdPerAsset;

    const usdPerCommodity = Number(config.exchangeRates.commodities_usd?.[unit]);
    if (Number.isFinite(usdPerCommodity) && usdPerCommodity > 0) return 1 / usdPerCommodity;

    return null;
  }

  async function getUsdPrice(config, sourceKey) {
    const sources = config.exchanges.sources || {};
    const key = sourceKey || config.exchanges.default || "coinbase";
    const source = sources[key];

    if (!source) throw new Error("Missing source: " + key);

    const parser = PARSERS[source.parser];
    if (!parser) throw new Error("Missing parser: " + source.parser);

    const d = await json(source.url);
    const price = parser(d);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Bad BTC price from " + key);
    }

    return {
      price_usd: price,
      source_key: key,
      source_label: source.label || key
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

    if (!sourceSelect) {
      const label = document.createElement("label");
      label.textContent = "Source: ";

      sourceSelect = document.createElement("select");
      sourceSelect.setAttribute("data-source-select", "");

      const order = config.exchanges.order || Object.keys(config.exchanges.sources || {});
      order.forEach(key => {
        const src = config.exchanges.sources?.[key];
        if (!src) return;

        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = src.label || key;
        if (key === config.exchanges.default) opt.selected = true;
        sourceSelect.appendChild(opt);
      });

      label.appendChild(sourceSelect);
      controls.appendChild(label);
    }

    if (!unitSelect) {
      const label = document.createElement("label");
      label.textContent = "Unit: ";

      unitSelect = document.createElement("select");
      unitSelect.setAttribute("data-currency-select", "");

      (config.currencies.order || []).forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        if (code === config.currencies.default) opt.selected = true;
        unitSelect.appendChild(opt);
      });

      (config.assets.order || []).forEach(code => {
        if (code === "BTC") return;
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = getLabel(config, code);
        unitSelect.appendChild(opt);
      });

      label.appendChild(unitSelect);
      controls.appendChild(label);
    }

    return { sourceSelect, unitSelect };
  }

  function normalizeMarkup(root, config, unit) {
    const sym = getSymbol(config, unit);
    const label = getLabel(config, unit);

    const btcLine = root.querySelector(".btc-line");
    const units = root.querySelectorAll(".unit");

    if (btcLine) {
      btcLine.innerHTML =
        `[BTC]: <span data-currency-symbol>${sym}</span>` +
        `<span class="btc-value" data-btc>—</span> ` +
        `(<span data-currency-label>${label}</span>)`;
    }

    if (units[0]) {
      units[0].innerHTML =
        `[mBTC]: <span data-currency-symbol>${sym}</span>` +
        `<span data-mbtc>—</span> ` +
        `(<span data-currency-label>${label}</span>)`;
    }

    if (units[1]) {
      units[1].innerHTML =
        `[μBTC]: <span data-currency-symbol>${sym}</span>` +
        `<span data-ubtc>—</span> ` +
        `(<span data-currency-label>${label}</span>)`;
    }

    if (units[2]) {
      units[2].innerHTML =
        `[sat]: <span data-currency-symbol>${sym}</span>` +
        `<span data-sat>—</span> ` +
        `(<span data-currency-label>${label}</span>)`;
    }
  }

  function ensureStatus(root) {
    let status = root.querySelector("[data-ticker-status]");
    if (!status) {
      status = document.createElement("div");
      status.className = "ticker-status";
      status.setAttribute("data-ticker-status", "");
      (root.querySelector(".zzx-ticker") || root).appendChild(status);
    }
    return status;
  }

  async function draw(root) {
    if (!root) return;

    try {
      const config = await loadConfig();
      const controls = ensureControls(root, config);

      const source = controls.sourceSelect.value || config.exchanges.default;
      const unit = controls.unitSelect.value || config.currencies.default || "USD";

      normalizeMarkup(root, config, unit);

      const price = await getUsdPrice(config, source);
      const rate = getConversionRate(config, unit);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("Missing conversion rate for " + unit);
      }

      const value = price.price_usd * rate;
      const assetMode = isAsset(config, unit);

      root.querySelector("[data-btc]").textContent = fmt(value, assetMode ? 6 : 2);
      root.querySelector("[data-mbtc]").textContent = fmt(value * 1e-3, assetMode ? 8 : 2);
      root.querySelector("[data-ubtc]").textContent = fmt(value * 1e-6, assetMode ? 10 : 4);
      root.querySelector("[data-sat]").textContent = fmt(value * 1e-8, assetMode ? 12 : 6);

      ensureStatus(root).textContent =
        `${price.source_label} · ${getLabel(config, unit)} · ${config.exchangeRates.updated_at || "rates loaded"}`;

      root.dataset.status = "ok";
      root.dataset.source = source;
      root.dataset.currency = unit;
    } catch (err) {
      root.dataset.status = "stale";
      ensureStatus(root).textContent = "Awaiting BPI API data: " + err.message;
    }
  }

  function boot(root) {
    if (!root) return;
    if (root.__zzxTickerTimer) clearInterval(root.__zzxTickerTimer);

    loadConfig().then(config => {
      const controls = ensureControls(root, config);
      const redraw = () => draw(root);

      if (!controls.sourceSelect.__zzxTickerBound) {
        controls.sourceSelect.addEventListener("change", redraw);
        controls.sourceSelect.__zzxTickerBound = true;
      }

      if (!controls.unitSelect.__zzxTickerBound) {
        controls.unitSelect.addEventListener("change", redraw);
        controls.unitSelect.__zzxTickerBound = true;
      }

      redraw();
      root.__zzxTickerTimer = setInterval(redraw, REFRESH_MS);
    }).catch(err => {
      ensureStatus(root).textContent = "Missing /bitcoin/bpi/api JSON: " + err.message;
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
