// __partials/widgets/mempool/widget.js
// DROP-IN (manifest/core compatible)
// - Uses allorigins for mempool.space endpoints
// - Shows: vMB, tx count, size MB, total fees BTC + USD
// - Pulls BTCUSD spot from Coinbase (via public api.coinbase.com) for USD calc
// - Idempotent; no runtime.js

(function () {
  "use strict";

  const W = window;
  const ID = "mempool";

  const DEFAULTS = {
    MEMPOOL_SUMMARY: "https://mempool.space/api/mempool",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    REFRESH_MS: 60_000
  };

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function setText(root, sel, txt) {
    const el = root.querySelector(sel);
    if (el) el.textContent = txt;
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }
  function fmt2(n) {
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  }
  function fmt6(n) {
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : "—";
  }

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-mp-status]", "loading…");

      const [mp, spot] = await Promise.all([
        fetchJSON(allOrigins(DEFAULTS.MEMPOOL_SUMMARY)),
        fetchJSON(DEFAULTS.COINBASE_SPOT)
      ]);

      // mempool.space /api/mempool example:
      // { count, vsize, total_fee }
      const count = Number(mp?.count);
      const vsize = Number(mp?.vsize);      // vbytes
      const feeSat = Number(mp?.total_fee); // sats

      // vMB = 1,000,000 vbytes (mempool.space uses vbytes)
      const vmb = Number.isFinite(vsize) ? (vsize / 1_000_000) : NaN;

      // rough MB display (bytes->MB); vbytes ~ bytes for our UI purposes
      const mb = Number.isFinite(vsize) ? (vsize / 1_000_000) : NaN;

      const feeBTC = Number.isFinite(feeSat) ? (feeSat / 100_000_000) : NaN;

      const btcUsd = parseFloat(spot?.data?.amount);
      const feeUSD = (Number.isFinite(feeBTC) && Number.isFinite(btcUsd)) ? (feeBTC * btcUsd) : NaN;

      setText(root, "[data-mp-vmb]", fmt2(vmb));
      setText(root, "[data-mp-tx]", fmtInt(count));
      setText(root, "[data-mp-mb]", fmt2(mb));
      setText(root, "[data-mp-fees-btc]", fmt6(feeBTC));
      setText(root, "[data-mp-fees-usd]", fmt2(feeUSD));

      setText(root, "[data-mp-status]", "mempool.space + Coinbase (via allorigins for mempool)");
    } catch (e) {
      setText(root, "[data-mp-status]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function wire(root) {
    const btn = root.querySelector("[data-mp-refresh]");
    if (btn && btn.dataset.zzxBound !== "1") {
      btn.dataset.zzxBound = "1";
      btn.addEventListener("click", () => refresh(root));
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxMempoolTimer) {
      clearInterval(root.__zzxMempoolTimer);
      root.__zzxMempoolTimer = null;
    }

    wire(root);
    refresh(root);
    root.__zzxMempoolTimer = setInterval(() => refresh(root), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
