// __partials/widgets/price-24h/sources.js
// Candle sources + normalizers (BTC/USD only where possible)
// NOTE: Binance removed per request.

(function () {
  "use strict";

  const NS = (window.ZZXPriceSources = window.ZZXPriceSources || {});

  // Normalized candle format: [{ t, o, h, l, c, v }] ascending by time

  NS.list = function listSources() {
    return [
      {
        id: "coinbase",
        label: "Coinbase Exchange",
        kind: "candles",
        url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
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
        url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=24",
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
        id: "gemini",
        label: "Gemini",
        kind: "candles",
        url: "https://api.gemini.com/v2/candles/btcusd/1hr?limit=24",
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

      // Bitfinex: BTCUSD 1h candles
      {
        id: "bitfinex",
        label: "Bitfinex",
        kind: "candles",
        url: "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=24",
        // rows: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME] desc
        normalize(json) {
          const rows = Array.isArray(json) ? json : [];
          const out = rows.map(r => ({
            t: Number(r?.[0]),
            o: Number(r?.[1]),
            c: Number(r?.[2]),
            h: Number(r?.[3]),
            l: Number(r?.[4]),
            v: Number(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },
    ];
  };
})();
