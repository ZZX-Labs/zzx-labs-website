// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
// Default source: Coinbase
// Optional sources: Kraken, Gemini, Bitstamp, Bitfinex, ZZX Global BPI
// Currency conversion: local /bitcoin/bpi/api/currencies.json first, Frankfurter fallback.

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const REFRESH_MS = 60000;

  const CURRENCY_SYMBOLS = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "C$",
    AUD: "A$",
    NZD: "NZ$",
    JPY: "¥",
    CHF: "CHF ",
    INR: "₹",
    CNY: "¥",
    HKD: "HK$",
    SGD: "S$",
    MXN: "MX$",
    BRL: "R$",
    ZAR: "R",
    SEK: "kr ",
    NOK: "kr ",
    DKK: "kr ",
    PLN: "zł ",
    CZK: "Kč ",
    HUF: "Ft ",
    TRY: "₺",
    ILS: "₪",
    AED: "د.إ ",
    SAR: "﷼ ",
    KRW: "₩"
  };

  const SOURCES = {
    coinbase: {
      label: "Coinbase",
      url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      parse: function (d) {
        return Number(d && d.data && d.data.amount);
      }
    },

    kraken: {
      label: "Kraken",
      url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      parse: function (d) {
        const r = d && d.result;
        const k = r && (r.XXBTZUSD || r.XBTUSD || r.BTCUSD);
        return Number(k && k.c && k.c[0]);
      }
    },

    gemini: {
      label: "Gemini",
      url: "https://api.gemini.com/v1/pubticker/btcusd",
      parse: function (d) {
        return Number(d && d.last);
      }
    },

    bitstamp: {
      label: "Bitstamp",
      url: "https://www.bitstamp.net/api/v2/ticker/btcusd/",
      parse: function (d) {
        return Number(d && d.last);
      }
    },

    bitfinex: {
      label: "Bitfinex",
      url: "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",
      parse: function (d) {
        return Array.isArray(d) ? Number(d[6]) : NaN;
      }
    },

    zzx: {
      label: "ZZX Global BPI",
      url: "/bitcoin/bpi/api/latest.json",
      parse: function (d) {
        return Number(d && (d.price_usd || d.btc_usd || d.price));
      }
    }
  };

  const SOURCE_ORDER = [
    "coinbase",
    "kraken",
    "gemini",
    "bitstamp",
    "bitfinex",
    "zzx"
  ];

  function loadShared(cb) {
    if (W.ZZXAPI) return cb();

    const existing = document.querySelector('script[data-zzx-api-loader="1"]');
    if (existing) {
      existing.addEventListener("load", cb, { once: true });
      return;
    }

    const s = document.createElement("script");
    s.src = "/__partials/widgets/_shared/zzx-api.js";
    s.dataset.zzxApiLoader = "1";
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  async function rawJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  }

  async function fetchJSON(core, url) {
    if (core && typeof core.fetchJSON === "function") {
      return await core.fetchJSON(url);
    }

    if (W.ZZXAPI && typeof W.ZZXAPI.json === "function") {
      return await W.ZZXAPI.json(url, {});
    }

    return await rawJSON(url);
  }

  function formatNumber(n, digits) {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return "0.00";

    return x.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatInt(n) {
    const x = Number(n || 0);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString("en-US");
  }

  function symbolFor(currency) {
    return CURRENCY_SYMBOLS[currency] || currency + " ";
  }

  async function getUsdPrice(core, sourceKey) {
    const src = SOURCES[sourceKey] || SOURCES.coinbase;
    const d = await fetchJSON(core, src.url);
    const p = src.parse(d);

    if (!Number.isFinite(p) || p <= 0) {
      throw new Error("Bad BTC price from " + sourceKey);
    }

    return {
      price_usd: p,
      label: src.label,
      source: sourceKey,
      raw: d
    };
  }

  async function getFxRate(core, currency) {
    if (!currency || currency === "USD") return 1;

    try {
      const d = await fetchJSON(core, "/bitcoin/bpi/api/currencies.json");
      const r = Number(
        (d && d.rates && d.rates[currency]) ||
        (d && d.USD && d.USD[currency]) ||
        (d && d.usd && d.usd[currency]) ||
        0
      );

      if (Number.isFinite(r) && r > 0) return r;
    } catch (_) {}

    try {
      const d = await rawJSON(
        "https://api.frankfurter.app/latest?from=USD&to=" +
          encodeURIComponent(currency)
      );

      const r = Number(d && d.rates && d.rates[currency]);
      if (Number.isFinite(r) && r > 0) return r;
    } catch (_) {}

    return 1;
  }

  function ensureControls(root) {
    let controls = root.querySelector(".ticker-controls");

    if (!controls) {
      const ticker = root.querySelector(".zzx-ticker") || root;
      controls = document.createElement("div");
      controls.className = "ticker-controls";
      ticker.insertBefore(controls, ticker.firstChild);
    }

    let sourceSelect = root.querySelector("[data-source-select]");
    let currencySelect = root.querySelector("[data-currency-select]");

    if (!sourceSelect) {
      const label = document.createElement("label");
      label.textContent = "Source: ";

      sourceSelect = document.createElement("select");
      sourceSelect.setAttribute("data-source-select", "");

      SOURCE_ORDER.forEach(function (key) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = SOURCES[key].label;
        if (key === "coinbase") opt.selected = true;
        sourceSelect.appendChild(opt);
      });

      label.appendChild(sourceSelect);
      controls.appendChild(label);
    }

    if (!currencySelect) {
      const label = document.createElement("label");
      label.textContent = "Currency: ";

      currencySelect = document.createElement("select");
      currencySelect.setAttribute("data-currency-select", "");

      [
        "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "CHF",
        "INR", "CNY", "HKD", "SGD", "MXN", "BRL", "ZAR",
        "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY",
        "ILS", "AED", "SAR", "KRW"
      ].forEach(function (code) {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        if (code === "USD") opt.selected = true;
        currencySelect.appendChild(opt);
      });

      label.appendChild(currencySelect);
      controls.appendChild(label);
    }

    return { sourceSelect: sourceSelect, currencySelect: currencySelect };
  }

  function updateLegacyMarkup(root, price, currency) {
    const sym = symbolFor(currency);

    const btcEl = root.querySelector("[data-btc]");
    const mbtcEl = root.querySelector("[data-mbtc]");
    const ubtcEl = root.querySelector("[data-ubtc]");
    const satEl = root.querySelector("[data-sat]");

    if (btcEl) btcEl.textContent = formatNumber(price, 2);
    if (mbtcEl) mbtcEl.textContent = formatNumber(price * 1e-3, 2);
    if (ubtcEl) ubtcEl.textContent = formatNumber(price * 1e-6, 4);
    if (satEl) satEl.textContent = formatNumber(price * 1e-8, 6);

    root.querySelectorAll("[data-currency-symbol]").forEach(function (el) {
      el.textContent = sym;
    });

    root.querySelectorAll("[data-currency-label]").forEach(function (el) {
      el.textContent = currency;
    });

    const btcLine = root.querySelector(".btc-line");
    if (btcLine && !root.querySelector("[data-currency-symbol]")) {
      btcLine.innerHTML =
        "[BTC]: " +
        sym +
        '<span class="btc-value" data-btc>' +
        formatNumber(price, 2) +
        "</span> (" +
        currency +
        ")";
    }

    const units = root.querySelectorAll(".unit");
    if (units.length >= 3 && !root.querySelector("[data-currency-symbol]")) {
      units[0].innerHTML =
        "[mBTC]: " +
        sym +
        "<span data-mbtc>" +
        formatNumber(price * 1e-3, 2) +
        "</span> (" +
        currency +
        ")";
      units[1].innerHTML =
        "[μBTC]: " +
        sym +
        "<span data-ubtc>" +
        formatNumber(price * 1e-6, 4) +
        "</span> (" +
        currency +
        ")";
      units[2].innerHTML =
        "[sat]: " +
        sym +
        "<span data-sat>" +
        formatNumber(price * 1e-8, 6) +
        "</span> (" +
        currency +
        ")";
    }
  }

  async function draw(root, core) {
    if (!root) return;

    const controls = ensureControls(root);
    const source = controls.sourceSelect.value || "coinbase";
    const currency = controls.currencySelect.value || "USD";

    try {
      const p = await getUsdPrice(core, source);
      const rate = await getFxRate(core, currency);
      const converted = p.price_usd * rate;

      updateLegacyMarkup(root, converted, currency);

      root.dataset.status = "ok";
      root.dataset.source = source;
      root.dataset.currency = currency;

      let status = root.querySelector("[data-ticker-status]");
      if (!status) {
        status = document.createElement("div");
        status.className = "ticker-status";
        status.setAttribute("data-ticker-status", "");
        const ticker = root.querySelector(".zzx-ticker") || root;
        ticker.appendChild(status);
      }

      status.textContent =
        p.label +
        " · " +
        currency +
        (currency === "USD" ? "" : " · FX") +
        " · refresh 60s";

      root.__zzxTickerHadGoodDraw = true;
    } catch (_) {
      root.dataset.status = "stale";

      if (!root.__zzxTickerHadGoodDraw) {
        updateLegacyMarkup(root, 0, currency);

        let status = root.querySelector("[data-ticker-status]");
        if (!status) {
          status = document.createElement("div");
          status.className = "ticker-status";
          status.setAttribute("data-ticker-status", "");
          const ticker = root.querySelector(".zzx-ticker") || root;
          ticker.appendChild(status);
        }

        status.textContent = "Awaiting BTC price source.";
      }
    }
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxTickerTimer) {
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    const controls = ensureControls(root);

    const redraw = function () {
      draw(root, core);
    };

    if (!controls.sourceSelect.__zzxTickerBound) {
      controls.sourceSelect.addEventListener("change", redraw);
      controls.sourceSelect.__zzxTickerBound = true;
    }

    if (!controls.currencySelect.__zzxTickerBound) {
      controls.currencySelect.addEventListener("change", redraw);
      controls.currencySelect.__zzxTickerBound = true;
    }

    redraw();

    root.__zzxTickerTimer = setInterval(redraw, REFRESH_MS);
  }

  function mount(root, core) {
    loadShared(function () {
      boot(root, core || W.ZZXWidgetsCore || null);
    });
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, mount);
    return;
  }

  if (W.ZZXAPI && typeof W.ZZXAPI.register === "function") {
    W.ZZXAPI.register(ID, function (root, core) {
      mount(root, core);
    });
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, core) {
      mount(root, core);
    });
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll('[data-widget="bitcoin-ticker"], .ticker-shell')
      .forEach(function (root) {
        boot(root, null);
      });
  });
})();
