// __partials/widgets/bitavg/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBitAvgModel?.__version >= 1) return;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function build(data) {
    if (!data || typeof data !== "object") throw new Error("invalid BPI snapshot");

    const bpi = finite(data.bpi_usd ?? data.price_usd ?? data.vwap_usd);
    if (!Number.isFinite(bpi) || bpi <= 0) throw new Error("weighted BPI unavailable");

    const rows = Object.values(data.exchanges || {})
      .filter(row =>
        row &&
        row.include_in_bpi !== false &&
        finite(row.price_usd) > 0 &&
        finite(row.weight) >= 0
      )
      .map(row => {
        const price = finite(row.price_usd);
        const weight = finite(row.weight);
        const volume = finite(row.volume_24h_btc);
        return {
          label: row.label || row.source || "exchange",
          source: row.source || "",
          price,
          weight,
          volume: Number.isFinite(volume) ? volume : 0,
          deviationPct: ((price - bpi) / bpi) * 100
        };
      })
      .sort((a, b) => b.weight - a.weight);

    const prices = rows.map(r => r.price);
    const high = prices.length ? Math.max(...prices) : NaN;
    const low = prices.length ? Math.min(...prices) : NaN;
    const spread = Number.isFinite(high) && Number.isFinite(low) ? high - low : NaN;
    const spreadPct = Number.isFinite(spread) ? (spread / bpi) * 100 : NaN;

    return {
      bpi,
      rows,
      included: Number(data.bpi_exchange_count ?? rows.length),
      volume: finite(data.volume_24h_btc),
      spread,
      spreadPct,
      top: rows[0] || null,
      weightSum: rows.reduce((sum, row) => sum + row.weight, 0),
      updatedAt: data.updated_at || null,
      method: data.weighted_average?.method || "volume-weighted exchange average"
    };
  }

  W.ZZXBitAvgModel = Object.freeze({
    __version: 1,
    build
  });
})();
