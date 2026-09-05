// __partials/widgets/bitbilling/js/invoice.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBitBillingInvoice?.__version >= 1) return;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function build(input) {
    const amount = finite(input.amount);
    const btc = finite(input.btc);
    const usd = finite(input.usd);
    const btcUsd = finite(input.btcUsd);

    if (!(amount >= 0) || !(btc >= 0) || !(usd >= 0) || !(btcUsd > 0)) {
      throw new Error("invalid invoice snapshot");
    }

    const sats = Math.round(btc * 1e8);
    const mbtc = btc * 1000;
    const timestamp = input.timestamp || new Date().toISOString();

    return {
      amount,
      currency: String(input.currency || "USD"),
      memo: String(input.memo || "").trim(),
      btc,
      sats,
      mbtc,
      usd,
      btcUsd,
      providers: Array.isArray(input.providers) ? [...new Set(input.providers)] : [],
      timestamp
    };
  }

  function summary(invoice) {
    const lines = [
      "BitBilling invoice snapshot",
      `${invoice.amount} ${invoice.currency}`,
      `${invoice.btc.toFixed(8)} BTC`,
      `${invoice.sats.toLocaleString()} sats`,
      `${invoice.mbtc.toFixed(5)} mBTC`,
      `USD equivalent: $${invoice.usd.toFixed(2)}`,
      `BTC/USD snapshot: $${invoice.btcUsd.toFixed(2)}`,
      `Timestamp: ${invoice.timestamp}`
    ];

    if (invoice.memo) lines.push(`Reference: ${invoice.memo}`);
    if (invoice.providers.length) lines.push(`Sources: ${invoice.providers.join(" + ")}`);
    lines.push("Calculator only; no custody, payment address, or rate lock.");

    return lines.join("\n");
  }

  W.ZZXBitBillingInvoice = Object.freeze({
    __version: 1,
    build,
    summary
  });
})();
