// __partials/widgets/high-low-24h/js/sources.js
// Exchange definitions + normalized completed hourly candles.
// Registers window.ZZXHighLow24Sources.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXHighLow24Sources?.__version >= 1) return;

  const HOUR_MS = 60 * 60 * 1000;

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeCandles(rows) {
    const byTime = new Map();

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

      byTime.set(candle.t, candle);
    }

    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }

  function completedHourly(candles, nowMs) {
    const now = Number.isFinite(Number(nowMs))
      ? Number(nowMs)
      : Date.now();

    return normalizeCandles(candles).filter(
      candle => (candle.t + HOUR_MS) <= now
    );
  }

  function final24Completed(candles, nowMs) {
    return completedHourly(candles, nowMs).slice(-24);
  }

  const sources = [
    {
      id: "coinbase",
      label: "Coinbase Exchange",
      url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
      normalize(payload) {
        return final24Completed(
          (Array.isArray(payload) ? payload : []).map(row => ({
            t: number(row?.[0]) * 1000,
            l: row?.[1],
            h: row?.[2],
            o: row?.[3],
            c: row?.[4],
            v: row?.[5]
          }))
        );
      }
    },

    {
      id: "kraken",
      label: "Kraken",
      url: "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60",
      normalize(payload) {
        const result = payload?.result || {};
        const key = Object.keys(result).find(
          item => item !== "last" && Array.isArray(result[item])
        );
        const rows = key ? result[key] : [];

        return final24Completed(rows.map(row => ({
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
      url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=72",
      normalize(payload) {
        const rows = payload?.data?.ohlc;

        return final24Completed(
          (Array.isArray(rows) ? rows : []).map(row => ({
            t: number(row?.timestamp) * 1000,
            o: row?.open,
            h: row?.high,
            l: row?.low,
            c: row?.close,
            v: row?.volume
          }))
        );
      }
    },

    {
      id: "gemini",
      label: "Gemini",
      url: "https://api.gemini.com/v2/candles/btcusd/1hr",
      normalize(payload) {
        return final24Completed(
          (Array.isArray(payload) ? payload : []).map(row => ({
            t: row?.[0],
            o: row?.[1],
            h: row?.[2],
            l: row?.[3],
            c: row?.[4],
            v: row?.[5]
          }))
        );
      }
    },

    {
      id: "bitfinex",
      label: "Bitfinex",
      url: "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=72&sort=1",
      normalize(payload) {
        return final24Completed(
          (Array.isArray(payload) ? payload : []).map(row => ({
            t: row?.[0],
            o: row?.[1],
            c: row?.[2],
            h: row?.[3],
            l: row?.[4],
            v: row?.[5]
          }))
        );
      }
    }
  ];

  W.ZZXHighLow24Sources = {
    __version: 1,
    HOUR_MS,

    list() {
      return sources.slice();
    },

    get(id) {
      return sources.find(source => source.id === id) || null;
    },

    normalizeCandles,
    completedHourly,
    final24Completed
  };
})();
