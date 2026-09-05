// __partials/widgets/price-24h/js/sources.js
// Exchange definitions + candle normalizers.
// Registers window.ZZXPrice24Sources.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXPrice24Sources?.__version >= 1) return;

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeCandles(rows) {
    const seen = new Map();

    for (const raw of Array.isArray(rows) ? rows : []) {
      if (!raw) continue;

      const candle = {
        t: number(raw.t),
        o: number(raw.o),
        h: number(raw.h),
        l: number(raw.l),
        c: number(raw.c),
        v: number(raw.v)
      };

      if (
        !Number.isFinite(candle.t) ||
        !Number.isFinite(candle.o) ||
        !Number.isFinite(candle.h) ||
        !Number.isFinite(candle.l) ||
        !Number.isFinite(candle.c)
      ) {
        continue;
      }

      seen.set(candle.t, candle);
    }

    return [...seen.values()].sort((a, b) => a.t - b.t);
  }

  function trim24h(candles) {
    const clean = normalizeCandles(candles);
    if (!clean.length) return [];

    const lastTs = clean[clean.length - 1].t;
    const cutoff = lastTs - 24 * 60 * 60 * 1000;

    const windowed = clean.filter(c => c.t >= cutoff);

    // Hourly endpoints can yield 25 points when both boundaries are present.
    return windowed.length > 25 ? windowed.slice(-25) : windowed;
  }

  const sources = [
    {
      id: "coinbase",
      label: "Coinbase Exchange",
      url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
      normalize(payload) {
        return trim24h((Array.isArray(payload) ? payload : []).map(row => ({
          t: number(row?.[0]) * 1000,
          l: row?.[1],
          h: row?.[2],
          o: row?.[3],
          c: row?.[4],
          v: row?.[5]
        })));
      }
    },

    {
      id: "kraken",
      label: "Kraken",
      url: "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60",
      normalize(payload) {
        const result = payload?.result || {};
        const key = Object.keys(result).find(
          k => k !== "last" && Array.isArray(result[k])
        );

        const rows = key ? result[key] : [];

        return trim24h(rows.map(row => ({
          t: number(row?.[0]) * 1000,
          o: row?.[1],
          h: row?.[2],
          l: row?.[3],
          c: row?.[4],
          v: row?.[6]
        })));
      }
    },

    {
      id: "bitstamp",
      label: "Bitstamp",
      url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=48",
      normalize(payload) {
        const rows = payload?.data?.ohlc;

        return trim24h((Array.isArray(rows) ? rows : []).map(row => ({
          t: number(row?.timestamp) * 1000,
          o: row?.open,
          h: row?.high,
          l: row?.low,
          c: row?.close,
          v: row?.volume
        })));
      }
    },

    {
      id: "gemini",
      label: "Gemini",
      url: "https://api.gemini.com/v2/candles/btcusd/1hr",
      normalize(payload) {
        return trim24h((Array.isArray(payload) ? payload : []).map(row => ({
          t: row?.[0],
          o: row?.[1],
          h: row?.[2],
          l: row?.[3],
          c: row?.[4],
          v: row?.[5]
        })));
      }
    },

    {
      id: "bitfinex",
      label: "Bitfinex",
      url: "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=48&sort=1",
      normalize(payload) {
        return trim24h((Array.isArray(payload) ? payload : []).map(row => ({
          t: row?.[0],
          o: row?.[1],
          c: row?.[2],
          h: row?.[3],
          l: row?.[4],
          v: row?.[5]
        })));
      }
    }
  ];

  W.ZZXPrice24Sources = {
    __version: 1,

    list() {
      return sources.slice();
    },

    get(id) {
      return sources.find(source => source.id === id) || null;
    },

    normalizeCandles,
    trim24h
  };
})();
