// __partials/widgets/iching/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXIChingModel?.__version >= 1) return;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function portfolio(lots, currentPrice) {
    const rows = Array.isArray(lots) ? lots : [];

    const btc = rows.reduce((sum, lot) => sum + (finite(lot?.btc) || 0), 0);
    const cost = rows.reduce((sum, lot) => sum + (finite(lot?.usd) || 0), 0);
    const current = finite(currentPrice);

    const value = Number.isFinite(current) ? btc * current : NaN;
    const average = btc > 0 ? cost / btc : NaN;
    const returnPct = cost > 0 && Number.isFinite(value)
      ? ((value - cost) / cost) * 100
      : NaN;

    return { btc, cost, value, average, returnPct };
  }

  W.ZZXIChingModel = Object.freeze({
    __version: 1,
    portfolio
  });
})();
