// __partials/widgets/fees/widget.js
// DROP-IN (manifest/core compatible)
// - Uses allorigins to query mempool.space fees (avoids CORS issues)
// - Updates UI + refresh button
// - Idempotent; no runtime.js

(function () {
  "use strict";

  const W = window;
  const ID = "fees";

  const DEFAULTS = {
    FEES_URL: "https://mempool.space/api/v1/fees/recommended",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
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

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function fmt(n) {
    return Number.isFinite(n) ? String(Math.round(n)) : "—";
  }

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-fees-status]", "loading…");

      const data = await fetchJSON(allOrigins(DEFAULTS.FEES_URL));

      // mempool.space: { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
      const fastest = Number(data?.fastestFee);
      const halfHr  = Number(data?.halfHourFee);
      const hour    = Number(data?.hourFee);
      const econ    = Number(data?.economyFee);
      const min     = Number(data?.minimumFee);

      setText(root, "[data-fees-fast]", fmt(fastest));
      setText(root, "[data-fees-30m]", fmt(halfHr));
      setText(root, "[data-fees-1h]", fmt(hour));
      setText(root, "[data-fees-econ]", fmt(econ));
      setText(root, "[data-fees-min]", fmt(min));

      setText(root, "[data-fees-status]", "mempool.space (via allorigins)");
    } catch (e) {
      setText(root, "[data-fees-status]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function wire(root) {
    const btn = root.querySelector("[data-fees-refresh]");
    if (btn && btn.dataset.zzxBound !== "1") {
      btn.dataset.zzxBound = "1";
      btn.addEventListener("click", () => refresh(root));
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxFeesTimer) {
      clearInterval(root.__zzxFeesTimer);
      root.__zzxFeesTimer = null;
    }

    wire(root);
    refresh(root);
    root.__zzxFeesTimer = setInterval(() => refresh(root), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
