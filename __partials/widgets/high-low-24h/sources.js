// __partials/widgets/high-low-24h/sources.js
// DROP-IN (module)
// Candle sources (1h) with normalizers.
// Exposes: window.ZZXHLSources.list()

(function () {
  "use strict";

  const NS = (window.ZZXHLSources = window.ZZXHLSources || {});

  function n(x){
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  NS.list = function list() {
    return [
      {
        id: "coinbase",
        label: "Coinbase Exchange",
        url: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
        normalize(json){
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
        url: "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60",
        normalize(json){
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
        url: "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=3600&limit=72",
        normalize(json){
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
        url: "https://api.gemini.com/v2/candles/btcusd/1hr?limit=72",
        normalize(json){
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
        url: "https://api-pub.bitfinex.com/v2/candles/trade:1h:tBTCUSD/hist?limit=72",
        normalize(json){
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
