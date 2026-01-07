// __partials/widgets/price-24h/sources.js
// Exchange candle sources (prefer 1h candles) + normalizers.
// Loaded by price-24h/widget.js at runtime.

(function () {
  "use strict";

  const NS = (window.ZZXPriceSources = window.ZZXPriceSources || {});

  // Normalized output:
  // [{ t, o, h, l, c, v }] ascending by time
  // t is ms epoch

  NS.list = function listSources() {
    return [
      {
        id: "coinbase",
        label: "Coinbase Exchange",
        kind: "candles",
        url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
        // rows: [time, low, high, open, close, volume] (desc)
        normalize(json) {
          const arr = Array.isArray(json) ? json : [];
          const out = arr.map(r => ({
            t: Number(r?.[0]) * 1000,
            l: Number(r?.[1]),
            h: Number(r?.[2]),
            o: Number(r?.[3]),
            c: Number(r?.[4]),
            v: Number(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "kraken",
        label: "Kraken",
        kind: "candles",
        url: "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60",
        // result[pair]: [[time, open, high, low, close, vwap, volume, count], ...] (asc)
        normalize(json) {
          const res = json?.result || {};
          const key = Object.keys(res).find(k => Array.isArray(res[k])) || null;
          const rows = key ? res[key] : [];
          const out = (Array.isArray(rows) ? rows : []).map(r => ({
            t: Number(r?.[0]) * 1000,
            o: Number(r?.[1]),
            h: Number(r?.[2]),
            l: Number(r?.[3]),
            c: Number(r?.[4]),
            v: Number(r?.[6]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "bitstamp",
        label: "Bitstamp",
        kind: "candles",
        url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=48",
        // data.ohlc: [{timestamp, open, high, low, close, volume}, ...] (asc)
        normalize(json) {
          const rows = json?.data?.ohlc;
          const out = (Array.isArray(rows) ? rows : []).map(r => ({
            t: Number(r?.timestamp) * 1000,
            o: Number(r?.open),
            h: Number(r?.high),
            l: Number(r?.low),
            c: Number(r?.close),
            v: Number(r?.volume),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "binance",
        label: "Binance (USDT proxy)",
        kind: "candles",
        url: "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=48",
        // rows: [openTime, open, high, low, close, volume, ...] (asc)
        normalize(json) {
          const rows = Array.isArray(json) ? json : [];
          const out = rows.map(r => ({
            t: Number(r?.[0]),
            o: Number(r?.[1]),
            h: Number(r?.[2]),
            l: Number(r?.[3]),
            c: Number(r?.[4]),
            v: Number(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "gemini",
        label: "Gemini",
        kind: "candles",
        url: "https://api.gemini.com/v2/candles/btcusd/1hr?limit=48",
        // rows: [time, open, high, low, close, volume] (ms, desc)
        normalize(json) {
          const rows = Array.isArray(json) ? json : [];
          const out = rows.map(r => ({
            t: Number(r?.[0]),
            o: Number(r?.[1]),
            h: Number(r?.[2]),
            l: Number(r?.[3]),
            c: Number(r?.[4]),
            v: Number(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },
    ];
  };
})();
