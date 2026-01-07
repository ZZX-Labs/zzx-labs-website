// __partials/widgets/volume-24h/sources.js
// DROP-IN (module)
// Exchange candle sources (1h candles where possible) + normalizers.
//
// Exposes: window.ZZXPriceSources.list()
// (We intentionally reuse the SAME namespace as price-24h so widget wrappers can share it.)

(function () {
  "use strict";

  const NS = (window.ZZXPriceSources = window.ZZXPriceSources || {});

  // Normalized candles (ascending):
  // [{ t, o, h, l, c, v }]

  function n(x){
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  NS.list = function listSources() {
    return [
      {
        id: "coinbase",
        label: "Coinbase Exchange",
        kind: "candles",
        // Coinbase returns up to 300; we will slice -48 in widget wrapper.
        url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
        // rows: [time, low, high, open, close, volume] (desc)
        normalize(json) {
          const arr = Array.isArray(json) ? json : [];
          const out = arr.map(r => ({
            t: n(r?.[0]) ? n(r?.[0]) * 1000 : null,
            l: n(r?.[1]),
            h: n(r?.[2]),
            o: n(r?.[3]),
            c: n(r?.[4]),
            v: n(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "kraken",
        label: "Kraken",
        kind: "candles",
        // Kraken OHLC can return a lot; we slice -48 later.
        url: "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60",
        // result[pair]: [[time, open, high, low, close, vwap, volume, count], ...] (asc)
        normalize(json) {
          const res = json?.result || {};
          const key = Object.keys(res).find(k => Array.isArray(res[k])) || null;
          const rows = key ? res[key] : [];
          const out = (Array.isArray(rows) ? rows : []).map(r => ({
            t: n(r?.[0]) ? n(r?.[0]) * 1000 : null,
            o: n(r?.[1]),
            h: n(r?.[2]),
            l: n(r?.[3]),
            c: n(r?.[4]),
            v: n(r?.[6]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "bitstamp",
        label: "Bitstamp",
        kind: "candles",
        // Ask for 48 explicitly.
        url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=48",
        // data.ohlc: [{timestamp, open, high, low, close, volume}, ...] (asc)
        normalize(json) {
          const rows = json?.data?.ohlc;
          const out = (Array.isArray(rows) ? rows : []).map(r => ({
            t: n(r?.timestamp) ? n(r?.timestamp) * 1000 : null,
            o: n(r?.open),
            h: n(r?.high),
            l: n(r?.low),
            c: n(r?.close),
            v: n(r?.volume),
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
            t: n(r?.[0]),
            o: n(r?.[1]),
            h: n(r?.[2]),
            l: n(r?.[3]),
            c: n(r?.[4]),
            v: n(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },

      {
        id: "bitfinex",
        label: "Bitfinex",
        kind: "candles",
        // Bitfinex v2 candles. Returns desc by default.
        url: "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=48",
        // rows: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME] (desc)
        normalize(json) {
          const rows = Array.isArray(json) ? json : [];
          const out = rows.map(r => ({
            t: n(r?.[0]),
            o: n(r?.[1]),
            c: n(r?.[2]),
            h: n(r?.[3]),
            l: n(r?.[4]),
            v: n(r?.[5]),
          })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.c));
          out.sort((a,b)=>a.t-b.t);
          return out;
        }
      },
    ];
  };
})();
