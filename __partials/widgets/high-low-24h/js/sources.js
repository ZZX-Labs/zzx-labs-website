// Shared by price-24h, volume-24h, high-low-24h.
// Loads the exact exchange catalog/order used by bitcoin-ticker.

(function () {
  "use strict";

  const W = window;
  if (W.ZZXMarket24Sources?.__version >= 3) return;

  const HOUR_MS = 60 * 60 * 1000;

  const ENDPOINTS = Object.freeze({
    exchanges: "/bitcoin/bpi/api/exchanges.json",
    latest: "/bitcoin/bpi/api/latest.json",
    history: "/bitcoin/bpi/api/history.json"
  });

  const FALLBACK_ORDER = [
    "zzx",
    "coinbase",
    "kraken",
    "gemini",
    "bitstamp",
    "bitfinex",
    "okx",
    "crypto_com",
    "kucoin",
    "gateio",
    "bitget",
    "mexc",
    "htx",
    "okcoin",
    "binance_us",
    "coingecko_global"
  ];

  const FALLBACK_LABELS = {
    zzx: "ZZX Global BPI",
    coinbase: "Coinbase",
    kraken: "Kraken",
    gemini: "Gemini",
    bitstamp: "Bitstamp",
    bitfinex: "Bitfinex",
    okx: "OKX",
    crypto_com: "Crypto.com",
    kucoin: "KuCoin",
    gateio: "Gate.io",
    bitget: "Bitget",
    mexc: "MEXC",
    htx: "HTX",
    okcoin: "OKCoin",
    binance_us: "Binance US",
    coingecko_global: "CoinGecko Global"
  };

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function ms(value) {
    const n = number(value);
    if (!Number.isFinite(n)) return NaN;
    return n > 10_000_000_000 ? n : n * 1000;
  }

  function candle(t, o, h, l, c, v) {
    return {
      t: ms(t),
      o: number(o),
      h: number(h),
      l: number(l),
      c: number(c),
      v: number(v)
    };
  }

  function normalizeCandles(rows) {
    const byTime = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row) continue;

      const item = candle(row.t, row.o, row.h, row.l, row.c, row.v);

      if (
        !Number.isFinite(item.t) ||
        !Number.isFinite(item.o) ||
        !Number.isFinite(item.h) ||
        !Number.isFinite(item.l) ||
        !Number.isFinite(item.c)
      ) {
        continue;
      }

      if (!Number.isFinite(item.v) || item.v < 0) item.v = 0;

      byTime.set(item.t, item);
    }

    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }

  function completedHourly(rows, nowMs) {
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

    return normalizeCandles(rows).filter(item =>
      item.t + HOUR_MS <= now
    );
  }

  function finalCompleted(rows, count) {
    return completedHourly(rows).slice(-Math.max(1, Number(count) || 48));
  }

  function configToCatalog(config) {
    const order =
      Array.isArray(config?.order) && config.order.length
        ? config.order
        : FALLBACK_ORDER;

    const sources = config?.sources || {};

    return order.map(id => ({
      id,
      label: sources[id]?.label || FALLBACK_LABELS[id] || id,
      pair: sources[id]?.pair || "",
      config: sources[id] || null
    }));
  }

  async function catalog(fetcher) {
    try {
      const config = await fetcher.json(ENDPOINTS.exchanges, {
        timeoutMs: 6000,
        retries: 1
      });

      return {
        catalog: configToCatalog(config),
        config
      };
    } catch (_) {
      return {
        catalog: configToCatalog(null),
        config: null
      };
    }
  }

  async function latest(fetcher) {
    return await fetcher.json(ENDPOINTS.latest, {
      timeoutMs: 6000,
      retries: 1
    });
  }

  function summaryFromLatest(latestPayload, id) {
    if (!latestPayload) return null;

    if (id === "zzx") {
      return {
        id,
        label: "ZZX Global BPI",
        price_usd: number(latestPayload.price_usd ?? latestPayload.btc_usd),
        volume_24h_btc: number(latestPayload.volume_24h_btc),
        volume_24h_usd: number(latestPayload.volume_24h_usd),
        high_24h: number(latestPayload.high_24h),
        low_24h: number(latestPayload.low_24h),
        updated_at: latestPayload.updated_at || null,
        mode: latestPayload.mode || "generated"
      };
    }

    const item = latestPayload.exchanges?.[id];
    if (!item) return null;

    return {
      id,
      label: item.label || FALLBACK_LABELS[id] || id,
      price_usd: number(item.price_usd),
      volume_24h_btc: number(item.volume_24h_btc),
      volume_24h_usd: number(item.volume_24h_usd),
      high_24h: number(item.high_24h),
      low_24h: number(item.low_24h),
      updated_at: item.updated_at || latestPayload.updated_at || null,
      mode: item.mode || (item.error ? "error" : "direct"),
      error: item.error || null
    };
  }

  function parseCoinbase(payload) {
    return finalCompleted((Array.isArray(payload) ? payload : []).map(row =>
      candle(row?.[0], row?.[3], row?.[2], row?.[1], row?.[4], row?.[5])
    ), 48);
  }

  function parseKraken(payload) {
    const result = payload?.result || {};
    const key = Object.keys(result).find(k => k !== "last" && Array.isArray(result[k]));
    const rows = key ? result[key] : [];

    return finalCompleted(rows.map(row =>
      candle(row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[6])
    ), 48);
  }

  function parseGemini(payload) {
    return finalCompleted((Array.isArray(payload) ? payload : []).map(row =>
      candle(row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[5])
    ), 48);
  }

  function parseBitstamp(payload) {
    return finalCompleted((payload?.data?.ohlc || []).map(row =>
      candle(row?.timestamp, row?.open, row?.high, row?.low, row?.close, row?.volume)
    ), 48);
  }

  function parseBitfinex(payload) {
    return finalCompleted((Array.isArray(payload) ? payload : []).map(row =>
      candle(row?.[0], row?.[1], row?.[3], row?.[4], row?.[2], row?.[5])
    ), 48);
  }

  function parseOKX(payload) {
    return finalCompleted((payload?.data || []).map(row =>
      candle(row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[5])
    ), 48);
  }

  function parseCryptoCom(payload) {
    const rows =
      payload?.result?.data ||
      payload?.result?.data_list ||
      payload?.data ||
      [];

    return finalCompleted(rows.map(row =>
      candle(
        row?.t ?? row?.timestamp,
        row?.o ?? row?.open,
        row?.h ?? row?.high,
        row?.l ?? row?.low,
        row?.c ?? row?.close,
        row?.v ?? row?.volume
      )
    ), 48);
  }

  function parseKuCoin(payload) {
    const rows = payload?.data || [];

    return finalCompleted(rows.map(row =>
      // [time, open, close, high, low, volume, turnover]
      candle(row?.[0], row?.[1], row?.[3], row?.[4], row?.[2], row?.[5])
    ), 48);
  }

  function parseGateIO(payload) {
    return finalCompleted((Array.isArray(payload) ? payload : []).map(row => {
      // Gate spot candlesticks:
      // [timestamp, quote_volume, close, high, low, open, base_volume, ...]
      const close = number(row?.[2]);
      let baseVolume = number(row?.[6]);

      if (!Number.isFinite(baseVolume)) {
        const quoteVolume = number(row?.[1]);
        baseVolume =
          Number.isFinite(quoteVolume) && Number.isFinite(close) && close > 0
            ? quoteVolume / close
            : 0;
      }

      return candle(row?.[0], row?.[5], row?.[3], row?.[4], row?.[2], baseVolume);
    }), 48);
  }

  function parseBitget(payload) {
    return finalCompleted((payload?.data || []).map(row =>
      candle(row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[5])
    ), 48);
  }

  function parseBinanceStyle(payload) {
    return finalCompleted((Array.isArray(payload) ? payload : []).map(row =>
      candle(row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[5])
    ), 48);
  }

  function parseHTX(payload) {
    return finalCompleted((payload?.data || []).map(row =>
      candle(row?.id, row?.open, row?.high, row?.low, row?.close, row?.amount)
    ), 48);
  }

  function parseZZXHistory(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const sorted = rows
      .map(row => ({
        t: Date.parse(row?.updated_at || ""),
        price: number(row?.price_usd),
        volume: number(row?.volume_24h_btc)
      }))
      .filter(row => Number.isFinite(row.t) && Number.isFinite(row.price))
      .sort((a, b) => a.t - b.t);

    const out = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[Math.max(0, i - 1)];
      const o = previous.price;
      const c = current.price;

      out.push({
        t: current.t,
        o,
        h: Math.max(o, c),
        l: Math.min(o, c),
        c,
        v: Number.isFinite(current.volume) ? current.volume : 0
      });
    }

    return normalizeCandles(out);
  }

  function parseCoinGeckoMarket(payload) {
    const prices = Array.isArray(payload?.prices) ? payload.prices : [];
    const volumes = Array.isArray(payload?.total_volumes) ? payload.total_volumes : [];

    const volumeByTime = new Map(
      volumes
        .filter(row => Array.isArray(row) && Number.isFinite(number(row[0])))
        .map(row => [Math.round(number(row[0]) / 60000), number(row[1])])
    );

    const out = [];

    for (let i = 0; i < prices.length; i++) {
      const row = prices[i];
      const t = number(row?.[0]);
      const c = number(row?.[1]);

      if (!Number.isFinite(t) || !Number.isFinite(c)) continue;

      const previous = i > 0 ? number(prices[i - 1]?.[1]) : c;
      const o = Number.isFinite(previous) ? previous : c;
      const quoteVolume = volumeByTime.get(Math.round(t / 60000));
      const btcVolume =
        Number.isFinite(quoteVolume) && c > 0
          ? quoteVolume / c
          : 0;

      out.push({
        t,
        o,
        h: Math.max(o, c),
        l: Math.min(o, c),
        c,
        v: btcVolume
      });
    }

    return normalizeCandles(out).slice(-96);
  }


  function sliceByHours(candles, hours, endTimestamp) {
    const clean = normalizeCandles(candles);

    if (!clean.length) return [];

    const end =
      Number.isFinite(number(endTimestamp))
        ? number(endTimestamp)
        : clean[clean.length - 1].t;

    const start =
      end -
      Math.max(1, number(hours) || 24) *
      HOUR_MS;

    return clean.filter(
      item =>
        item.t >= start &&
        item.t <= end
    );
  }

  function nearestAtOrBefore(
    candles,
    targetTimestamp
  ) {
    const clean =
      normalizeCandles(candles);

    const target =
      number(targetTimestamp);

    if (
      !clean.length ||
      !Number.isFinite(target)
    ) {
      return null;
    }

    let found = null;

    for (const item of clean) {
      if (item.t > target) break;
      found = item;
    }

    return found;
  }

  const ADAPTERS = {
    zzx: {
      urls: [ENDPOINTS.history],
      parse: parseZZXHistory,
      volumeMode: "rolling24h"
    },

    coinbase: {
      urls: [
        "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600"
      ],
      parse: parseCoinbase,
      volumeMode: "hourly"
    },

    kraken: {
      urls: [
        "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60"
      ],
      parse: parseKraken,
      volumeMode: "hourly"
    },

    gemini: {
      urls: [
        "https://api.gemini.com/v2/candles/btcusd/1hr"
      ],
      parse: parseGemini,
      volumeMode: "hourly"
    },

    bitstamp: {
      urls: [
        "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=96"
      ],
      parse: parseBitstamp,
      volumeMode: "hourly"
    },

    bitfinex: {
      urls: [
        "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=96&sort=1"
      ],
      parse: parseBitfinex,
      volumeMode: "hourly"
    },

    okx: {
      urls: [
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=96"
      ],
      parse: parseOKX,
      volumeMode: "hourly"
    },

    crypto_com: {
      urls: [
        "https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=BTC_USD&timeframe=1h&count=96",
        "https://api.crypto.com/v2/public/get-candlestick?instrument_name=BTC_USD&timeframe=1h"
      ],
      parse: parseCryptoCom,
      volumeMode: "hourly"
    },

    kucoin: {
      urls: [
        "https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol=BTC-USDT"
      ],
      parse: parseKuCoin,
      volumeMode: "hourly"
    },

    gateio: {
      urls: [
        "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1h&limit=96"
      ],
      parse: parseGateIO,
      volumeMode: "hourly"
    },

    bitget: {
      urls: [
        "https://api.bitget.com/api/v2/spot/market/candles?symbol=BTCUSDT&granularity=1h&limit=96"
      ],
      parse: parseBitget,
      volumeMode: "hourly"
    },

    mexc: {
      urls: [
        "https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=96"
      ],
      parse: parseBinanceStyle,
      volumeMode: "hourly"
    },

    htx: {
      urls: [
        "https://api.huobi.pro/market/history/kline?symbol=btcusdt&period=60min&size=96"
      ],
      parse: parseHTX,
      volumeMode: "hourly"
    },

    okcoin: {
      urls: [
        "https://www.okcoin.com/api/v5/market/candles?instId=BTC-USD&bar=1H&limit=96"
      ],
      parse: parseOKX,
      volumeMode: "hourly"
    },

    binance_us: {
      urls: [
        "https://api.binance.us/api/v3/klines?symbol=BTCUSD&interval=1h&limit=96"
      ],
      parse: parseBinanceStyle,
      volumeMode: "hourly"
    },

    coingecko_global: {
      urls: [
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2"
      ],
      parse: parseCoinGeckoMarket,
      volumeMode: "rolling24h"
    }
  };

  async function series(id, fetcher) {
    const adapter = ADAPTERS[id];

    if (!adapter) {
      throw new Error(`no 24h series adapter for ${id}`);
    }

    const result = await fetcher.firstJSON(adapter.urls, {
      timeoutMs: 10000,
      retries: 1
    });

    const candles = adapter.parse(result.data);

    if (!Array.isArray(candles) || candles.length < 2) {
      throw new Error(`${id} returned insufficient 24h series data`);
    }

    return {
      candles,
      provider: result.url,
      volumeMode: adapter.volumeMode || "hourly"
    };
  }

  W.ZZXMarket24Sources = {
    __version: 3,
    HOUR_MS,
    ENDPOINTS,
    FALLBACK_ORDER: FALLBACK_ORDER.slice(),
    catalog,
    latest,
    summaryFromLatest,
    series,
    normalizeCandles,
    completedHourly,
    sliceByHours,
    nearestAtOrBefore
  };
})();
