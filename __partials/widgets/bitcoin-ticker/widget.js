// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
//
// Primary controller for widget.html + widget.css.
// No local submodules are required for this widget.
//
// Data policy:
// - ZZX /bitcoin/bpi/api/latest.json is authoritative/default.
// - Exchange choices come from /bitcoin/bpi/api/exchanges.json.
// - Fiat catalog comes from /bitcoin/bpi/api/currencies.json.
// - Symbols come from /bitcoin/bpi/api/symbols.json.
// - ZZXFX resolves fiat rates missing from the local 30-minute snapshot.
// - Direct exchange calls are fallback-only and never required for normal operation.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "bitcoin-ticker";

  const REFRESH_MS = 1000;
  const CONFIG_TTL_MS = 30 * 60 * 1000;
  const STALE_AFTER_MS = 5 * 60 * 1000;

  const STORAGE = {
    source: "zzx.widget.bitcoin-ticker.source",
    quote: "zzx.widget.bitcoin-ticker.quote"
  };

  const ENDPOINTS = {
    latest: "/bitcoin/bpi/api/latest.json",
    exchanges: "/bitcoin/bpi/api/exchanges.json",
    currencies: "/bitcoin/bpi/api/currencies.json",
    rates: "/bitcoin/bpi/api/exchange_rates.json",
    symbols: "/bitcoin/bpi/api/symbols.json"
  };

  const state = {
    config: null,
    configAt: 0,
    latest: null,
    latestAt: 0,
    inflightLatest: null,
    mountedRoots: new WeakSet()
  };

  function api() {
    return W.ZZXAPI || null;
  }

  function rootFor() {
    return (
      D.querySelector('[data-widget-root="' + ID + '"]') ||
      D.querySelector('[data-widget-slot="' + ID + '"]') ||
      D.querySelector('.btc-slot[data-widget="' + ID + '"]')
    );
  }

  function localURL(path) {
    const A = api();
    if (A && typeof A.url === "function") return A.url(path);
    return path;
  }

  async function fetchJSON(path, fallback) {
    const A = api();

    if (A && typeof A.jsonStrict === "function") {
      try {
        return await A.jsonStrict(path, {
          cacheBust: true,
          timeoutMs: 10000,
          retries: 1,
          retryDelayMs: 350
        });
      } catch (error) {
        if (arguments.length > 1) return fallback;
        throw error;
      }
    }

    try {
      const u = localURL(path);
      const sep = u.includes("?") ? "&" : "?";
      const response = await fetch(u + sep + "t=" + Date.now(), {
        cache: "no-store",
        credentials: /^https?:\/\//i.test(u) ? "omit" : "same-origin"
      });

      if (!response.ok) throw new Error("HTTP " + response.status + " " + path);
      return await response.json();
    } catch (error) {
      if (arguments.length > 1) return fallback;
      throw error;
    }
  }

  function finitePositive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : NaN;
  }

  function finiteNonNegative(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : NaN;
  }

  function safeGet(key) {
    try {
      return W.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      W.localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (!element) return;
    const text = value == null ? "—" : String(value);
    if (element.textContent !== text) element.textContent = text;
  }

  function selectOption(select, value) {
    if (!select || !value) return false;
    const wanted = String(value);

    for (const option of select.options) {
      if (option.value === wanted) {
        select.value = wanted;
        return true;
      }
    }

    return false;
  }

  function numberFormat(value, minDigits, maxDigits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";

    return n.toLocaleString(undefined, {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits
    });
  }

  function quoteDigits(value) {
    const n = Math.abs(Number(value));
    if (!Number.isFinite(n)) return 2;
    if (n >= 1000) return 2;
    if (n >= 1) return 4;
    if (n >= 0.01) return 6;
    if (n >= 0.0001) return 8;
    return 12;
  }

  function formatQuote(value) {
    const digits = quoteDigits(value);
    return numberFormat(value, digits > 4 ? 0 : 2, digits);
  }

  function compact(value, digits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";

    try {
      return n.toLocaleString(undefined, {
        notation: "compact",
        maximumFractionDigits: digits == null ? 2 : digits
      });
    } catch (_) {
      return numberFormat(n, 0, digits == null ? 2 : digits);
    }
  }

  function formatAge(timestamp) {
    if (!timestamp) return "time unknown";

    const then = new Date(timestamp).getTime();
    if (!Number.isFinite(then)) return "time unknown";

    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

    if (seconds < 5) return "updated now";
    if (seconds < 60) return "updated " + seconds + "s ago";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return "updated " + minutes + "m ago";

    const hours = Math.floor(minutes / 60);
    return "updated " + hours + "h ago";
  }

  function parseTimestamp(value) {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : NaN;
  }

  function quoteTimestamp(latest, exchange) {
    return (
      (exchange && exchange.updated_at) ||
      (latest && latest.updated_at) ||
      null
    );
  }

  function sourceConfig(config, sourceId) {
    return (
      config &&
      config.exchanges &&
      config.exchanges.sources &&
      config.exchanges.sources[sourceId]
    ) || null;
  }

  function sourceLabel(config, sourceId, exchange) {
    if (exchange && exchange.label) return exchange.label;

    const cfg = sourceConfig(config, sourceId);
    if (cfg && cfg.label) return cfg.label;

    return sourceId === "zzx" ? "ZZX Global BPI" : sourceId;
  }

  function globalQuote(latest) {
    const price = finitePositive(
      latest && (
        latest.price_usd ||
        latest.btc_usd ||
        latest.vwap_usd ||
        latest.bpi_usd ||
        (latest.weighted_average && latest.weighted_average.price_usd) ||
        (latest.global_bpi && latest.global_bpi.price_usd)
      )
    );

    if (!Number.isFinite(price)) return null;

    return {
      sourceId: "zzx",
      label: "ZZX Global BPI",
      priceUsd: price,
      highUsd: finiteNonNegative(latest.high_24h),
      lowUsd: finiteNonNegative(latest.low_24h),
      volumeBtc: finiteNonNegative(latest.volume_24h_btc),
      volumeUsd: finiteNonNegative(latest.volume_24h_usd),
      timestamp: latest.updated_at || null,
      mode: latest.mode || "zzx-bpi",
      exchangeCount: Number(latest.bpi_exchange_count || latest.exchange_count || 0)
    };
  }

  function exchangeQuote(config, latest, sourceId) {
    const exchange =
      latest &&
      latest.exchanges &&
      latest.exchanges[sourceId];

    if (!exchange) return null;

    const price = finitePositive(exchange.price_usd);
    if (!Number.isFinite(price)) return null;

    return {
      sourceId: sourceId,
      label: sourceLabel(config, sourceId, exchange),
      priceUsd: price,
      highUsd: finiteNonNegative(exchange.high_24h),
      lowUsd: finiteNonNegative(exchange.low_24h),
      volumeBtc: finiteNonNegative(exchange.volume_24h_btc),
      volumeUsd: finiteNonNegative(exchange.volume_24h_usd),
      timestamp: quoteTimestamp(latest, exchange),
      mode: exchange.mode || "zzx-cache",
      exchangeCount: 1
    };
  }

  function sourceQuote(config, latest, sourceId) {
    if (sourceId === "zzx") return globalQuote(latest);

    return (
      exchangeQuote(config, latest, sourceId) ||
      globalQuote(latest)
    );
  }

  async function loadConfig(force) {
    const now = Date.now();

    if (
      !force &&
      state.config &&
      now - state.configAt < CONFIG_TTL_MS
    ) {
      return state.config;
    }

    const [exchanges, currencies, rates, symbols] = await Promise.all([
      fetchJSON(ENDPOINTS.exchanges),
      fetchJSON(ENDPOINTS.currencies),
      fetchJSON(ENDPOINTS.rates, { rates: { USD: 1 } }),
      fetchJSON(ENDPOINTS.symbols, { USD: "$" })
    ]);

    if (!rates.rates) rates.rates = {};
    rates.rates.USD = 1;

    state.config = {
      exchanges,
      currencies,
      rates,
      symbols
    };

    state.configAt = now;
    return state.config;
  }

  async function loadLatest(force) {
    const now = Date.now();

    if (
      !force &&
      state.latest &&
      now - state.latestAt < REFRESH_MS
    ) {
      return state.latest;
    }

    if (state.inflightLatest) return state.inflightLatest;

    state.inflightLatest = (async function () {
      const latest = await fetchJSON(ENDPOINTS.latest);
      state.latest = latest;
      state.latestAt = Date.now();
      return latest;
    })().finally(function () {
      state.inflightLatest = null;
    });

    return state.inflightLatest;
  }

  function fiatName(config, code) {
    return (
      config &&
      config.currencies &&
      config.currencies.names &&
      config.currencies.names[code]
    ) || code;
  }

  function currencySymbol(config, code) {
    return (
      config &&
      config.symbols &&
      config.symbols[code]
    ) || (code + " ");
  }

  async function fxRate(config, code) {
    const upper = String(code || "USD").toUpperCase();

    if (upper === "USD") {
      return {
        rate: 1,
        provider: "USD-base",
        live: false,
        updated_at: config.rates.updated_at || null
      };
    }

    const local = finitePositive(
      config &&
      config.rates &&
      config.rates.rates &&
      config.rates.rates[upper]
    );

    if (Number.isFinite(local)) {
      return {
        rate: local,
        provider: "zzx-bpi",
        live: false,
        updated_at: config.rates.updated_at || null
      };
    }

    if (
      W.ZZXFX &&
      typeof W.ZZXFX.rate === "function"
    ) {
      const result = await W.ZZXFX.rate(upper);

      if (
        result &&
        Number.isFinite(finitePositive(result.rate))
      ) {
        config.rates.rates[upper] = Number(result.rate);
        return result;
      }
    }

    throw new Error("No FX rate available for " + upper);
  }

  function populateSources(root, config) {
    const select = root.querySelector("[data-source-select]");
    if (!select) return;

    const sources =
      (config.exchanges && config.exchanges.sources) ||
      {};

    const order =
      (config.exchanges && config.exchanges.order) ||
      Object.keys(sources);

    const current =
      safeGet(STORAGE.source) ||
      (config.exchanges && config.exchanges.default) ||
      "zzx";

    select.replaceChildren();

    for (const id of order) {
      const source = sources[id];
      if (!source && id !== "zzx") continue;

      const option = D.createElement("option");
      option.value = id;
      option.textContent =
        (source && source.label) ||
        (id === "zzx" ? "ZZX Global BPI" : id);

      select.appendChild(option);
    }

    if (!select.options.length) {
      const option = D.createElement("option");
      option.value = "zzx";
      option.textContent = "ZZX Global BPI";
      select.appendChild(option);
    }

    if (!selectOption(select, current)) {
      select.value =
        (config.exchanges && config.exchanges.default) ||
        select.options[0].value;
    }
  }

  function populateCurrencies(root, config) {
    const select = root.querySelector("[data-currency-select]");
    if (!select) return;

    const order =
      (config.currencies && config.currencies.order) ||
      ["USD"];

    const current =
      safeGet(STORAGE.quote) ||
      (config.currencies && config.currencies.default) ||
      "USD";

    select.replaceChildren();

    for (const code of order) {
      const option = D.createElement("option");
      option.value = code;
      option.textContent =
        code + " — " + fiatName(config, code);
      select.appendChild(option);
    }

    if (!selectOption(select, current)) {
      select.value =
        (config.currencies && config.currencies.default) ||
        "USD";
    }
  }

  function quoteValue(usdValue, fx) {
    const usd = Number(usdValue);
    const rate = Number(fx && fx.rate);

    if (
      !Number.isFinite(usd) ||
      !Number.isFinite(rate)
    ) {
      return NaN;
    }

    return usd * rate;
  }

  function spreadPercent(high, low) {
    const h = Number(high);
    const l = Number(low);

    if (
      !Number.isFinite(h) ||
      !Number.isFinite(l) ||
      h <= 0 ||
      l <= 0
    ) {
      return NaN;
    }

    return ((h - l) / l) * 100;
  }

  function renderError(root, error) {
    const widget =
      root.querySelector("[data-bitcoin-ticker]") ||
      root;

    widget.dataset.status = "error";

    setText(
      root,
      "[data-state-text]",
      "Offline"
    );

    setText(
      root,
      "[data-provider-detail]",
      "ERROR: " +
      (
        error &&
        error.message
          ? error.message
          : "ticker update failed"
      )
    );
  }

  async function render(root) {
    const config = await loadConfig(false);
    const latest = await loadLatest(false);

    const sourceSelect =
      root.querySelector("[data-source-select]");

    const currencySelect =
      root.querySelector("[data-currency-select]");

    const sourceId =
      sourceSelect
        ? sourceSelect.value
        : "zzx";

    const currency =
      currencySelect
        ? currencySelect.value
        : "USD";

    const quote =
      sourceQuote(
        config,
        latest,
        sourceId
      );

    if (!quote) {
      throw new Error(
        "No usable BTC/USD quote"
      );
    }

    const fx =
      await fxRate(
        config,
        currency
      );

    const price =
      quoteValue(
        quote.priceUsd,
        fx
      );

    const high =
      quoteValue(
        quote.highUsd,
        fx
      );

    const low =
      quoteValue(
        quote.lowUsd,
        fx
      );

    if (!Number.isFinite(price)) {
      throw new Error(
        "Invalid converted BTC price"
      );
    }

    const symbol =
      currencySymbol(
        config,
        currency
      );

    const mbtc =
      price / 1000;

    const ubtc =
      price / 1000000;

    const sat =
      price / 100000000;

    setText(
      root,
      "[data-currency-symbol]",
      symbol
    );

    setText(
      root,
      "[data-currency-label]",
      currency
    );

    setText(
      root,
      "[data-btc]",
      formatQuote(price)
    );

    setText(
      root,
      "[data-mbtc-symbol]",
      symbol
    );

    setText(
      root,
      "[data-ubtc-symbol]",
      symbol
    );

    setText(
      root,
      "[data-sat-symbol]",
      symbol
    );

    setText(
      root,
      "[data-mbtc]",
      formatQuote(mbtc)
    );

    setText(
      root,
      "[data-ubtc]",
      formatQuote(ubtc)
    );

    setText(
      root,
      "[data-sat]",
      formatQuote(sat)
    );

    setText(
      root,
      "[data-high]",
      Number.isFinite(high)
        ? symbol + formatQuote(high)
        : "—"
    );

    setText(
      root,
      "[data-low]",
      Number.isFinite(low)
        ? symbol + formatQuote(low)
        : "—"
    );

    setText(
      root,
      "[data-volume]",
      Number.isFinite(quote.volumeBtc)
        ? compact(quote.volumeBtc, 2) +
          " BTC"
        : "—"
    );

    const spread =
      spreadPercent(
        quote.highUsd,
        quote.lowUsd
      );

    setText(
      root,
      "[data-spread]",
      Number.isFinite(spread)
        ? spread.toFixed(2) + "%"
        : "—"
    );

    setText(
      root,
      "[data-source-label]",
      quote.label
    );

    setText(
      root,
      "[data-update-age]",
      formatAge(
        quote.timestamp
      )
    );

    const ageMs =
      quote.timestamp
        ? Date.now() -
          parseTimestamp(
            quote.timestamp
          )
        : NaN;

    const stale =
      Number.isFinite(ageMs) &&
      ageMs >
        STALE_AFTER_MS;

    const widget =
      root.querySelector(
        "[data-bitcoin-ticker]"
      ) ||
      root;

    widget.dataset.status =
      stale
        ? "stale"
        : "ok";

    setText(
      root,
      "[data-state-text]",
      stale
        ? "Stale"
        : "Live"
    );

    const fxProvider =
      fx.provider ||
      "unknown FX";

    const sourceMode =
      quote.mode
        ? " / " + quote.mode
        : "";

    const count =
      quote.sourceId === "zzx" &&
      quote.exchangeCount > 0
        ? " / " +
          quote.exchangeCount +
          " exchanges"
        : "";

    setText(
      root,
      "[data-provider-detail]",
      quote.label +
      sourceMode +
      count +
      " / FX " +
      fxProvider
    );
  }

  function bind(root) {
    if (state.mountedRoots.has(root)) return;
    state.mountedRoots.add(root);

    const sourceSelect =
      root.querySelector(
        "[data-source-select]"
      );

    const currencySelect =
      root.querySelector(
        "[data-currency-select]"
      );

    const trigger =
      function () {
        if (
          typeof root.__zzxTickerRefresh ===
          "function"
        ) {
          root.__zzxTickerRefresh();
        }
      };

    if (sourceSelect) {
      sourceSelect.addEventListener(
        "change",
        function () {
          safeSet(
            STORAGE.source,
            sourceSelect.value
          );

          state.latestAt = 0;
          trigger();
        }
      );
    }

    if (currencySelect) {
      currencySelect.addEventListener(
        "change",
        function () {
          safeSet(
            STORAGE.quote,
            currencySelect.value
          );

          trigger();
        }
      );
    }
  }

  function startPolling(root) {
    let running = false;
    let queued = false;
    let stopped = false;
    let timer = null;

    async function refresh() {
      if (stopped) return;

      if (!root.isConnected) {
        stop();
        return;
      }

      if (running) {
        queued = true;
        return;
      }

      running = true;

      try {
        await render(root);
      } catch (error) {
        renderError(root, error);
      } finally {
        running = false;

        if (queued) {
          queued = false;
          refresh();
        }
      }
    }

    function schedule() {
      if (stopped) return;

      timer = W.setTimeout(
        async function tick() {
          await refresh();
          schedule();
        },
        REFRESH_MS
      );
    }

    function stop() {
      stopped = true;

      if (timer !== null) {
        W.clearTimeout(timer);
        timer = null;
      }

      root.__zzxTickerRefresh = null;
      root.__zzxTickerStop = null;
    }

    root.__zzxTickerRefresh = refresh;
    root.__zzxTickerStop = stop;

    refresh();
    schedule();

    return stop;
  }

  async function boot(root) {
    if (!root) return;

    if (
      typeof root.__zzxTickerStop ===
      "function"
    ) {
      root.__zzxTickerStop();
    }

    const widget =
      root.querySelector(
        "[data-bitcoin-ticker]"
      );

    if (!widget) {
      throw new Error(
        "bitcoin-ticker widget.html is missing [data-bitcoin-ticker]"
      );
    }

    widget.dataset.status =
      "loading";

    setText(
      root,
      "[data-state-text]",
      "Loading"
    );

    try {
      const config =
        await loadConfig(false);

      populateSources(
        root,
        config
      );

      populateCurrencies(
        root,
        config
      );

      bind(root);
      startPolling(root);

    } catch (error) {
      renderError(
        root,
        error
      );
    }
  }

  function register() {
    if (
      W.ZZXAPI &&
      typeof W.ZZXAPI.register ===
        "function"
    ) {
      W.ZZXAPI.register(
        ID,
        boot
      );

      return;
    }

    if (
      W.ZZXWidgetsCore &&
      typeof W.ZZXWidgetsCore.onMount ===
        "function"
    ) {
      W.ZZXWidgetsCore.onMount(
        ID,
        boot
      );

      return;
    }

    if (
      W.ZZXWidgets &&
      typeof W.ZZXWidgets.register ===
        "function"
    ) {
      W.ZZXWidgets.register(
        ID,
        boot
      );

      return;
    }

    const fallback =
      function () {
        const root =
          rootFor();

        if (root) {
          boot(root);
        }
      };

    if (
      D.readyState === "loading"
    ) {
      D.addEventListener(
        "DOMContentLoaded",
        fallback,
        {
          once: true
        }
      );
    } else {
      fallback();
    }
  }

  register();

})();
