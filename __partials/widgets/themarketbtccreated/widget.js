// __partials/widgets/themarketbtccreated/widget.js
(function () {
  "use strict";

  const W = window;
  const ID = "themarketbtccreated";
  const CFG = {
    REFRESH_MS: 120000,
    TIMEOUT_MS: 20000,
    CACHE_KEY: "zzx:themarketbtccreated:v3"
  };

  let inflight = false;

  const q = (root, sel) => root ? root.querySelector(sel) : null;
  const setText = (root, sel, value) => {
    const el = q(root, sel);
    if (el) el.textContent = String(value ?? "—");
  };

  const n = value => {
    const x = Number(value);
    return Number.isFinite(x) ? x : NaN;
  };

  const fmtInt = value => Number.isFinite(n(value))
    ? Math.trunc(n(value)).toLocaleString()
    : "—";

  const fmtUSD = (value, digits = 2) => Number.isFinite(n(value))
    ? n(value).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      })
    : "—";

  const fmtUSD0 = value => Number.isFinite(n(value))
    ? n(value).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      })
    : "—";

  const fmtFloat = (value, digits = 8) => Number.isFinite(n(value))
    ? n(value).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      })
    : "—";

  const fmtPct = (value, digits = 2) => Number.isFinite(n(value))
    ? `${n(value).toFixed(digits)}%`
    : "—";

  function fmtDate(value) {
    const date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function fmtCountdown(value) {
    const x = n(value);
    if (!Number.isFinite(x)) return "—";
    const total = Math.max(0, Math.trunc(x));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  function projectRootURL() {
    const current = new URL(document.baseURI);
    if (current.hostname.endsWith(".github.io")) {
      const parts = current.pathname.split("/").filter(Boolean);
      if (parts.length) return new URL(`/${parts[0]}/`, current.origin);
    }
    return new URL("/", current.origin);
  }

  function apiCandidates() {
    return [...new Set([
      new URL(
        "bitcoin/bpi/api/themarketbtccreated.json",
        projectRootURL()
      ).toString(),
      new URL(
        "api/themarketbtccreated.json",
        document.baseURI
      ).toString()
    ])];
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "follow",
        signal: controller.signal,
        headers: {"Accept": "application/json"}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function normalize(data) {
    if (
      !data ||
      typeof data !== "object" ||
      data.source !== "zzx_themarketbtccreated_deadopop_v3"
    ) {
      throw new Error("refusing stale TheMarketBTCCreated API schema");
    }

    const i = data.inputs || {};
    const o = data.outputs || {};
    const net = data.network || {};

    const s = {
      updatedAt: String(data.updated_at || ""),
      marketSource: String(data.market_data_source || "unknown"),
      blockSource: String(data.block_data_source || "unknown"),

      globalCap: n(i.current_global_crypto_market_cap_usd),
      btcCap: n(i.current_bitcoin_market_cap_usd),
      shitcoinCap: n(i.current_non_bitcoin_market_cap_usd),
      deadLoss: n(i.deadopop_cumulative_estimated_value_lost_usd),
      deadTotal: n(i.deadopop_total_dead_coins),
      deadValued: n(i.deadopop_valued_dead_coins),
      deadUnvalued: n(i.deadopop_unvalued_dead_coins),
      deadCoverage: n(i.deadopop_valuation_coverage_percent),

      spot: n(i.spot_btc_price_usd),
      supply: n(i.btc_circulating_supply),
      theoretical: n(o.the_market_btc_created_price_usd),
      adjusted: n(o.deadopop_adjusted_appraised_btc_price_usd),
      deltaUSD: n(o.baseline_delta_usd),
      deltaPct: n(o.baseline_delta_percent),
      invDeltaPct: n(o.inverse_baseline_delta_percent),
      totalDeltaUSD: n(o.total_delta_usd),
      totalDeltaPct: n(o.total_delta_percent),
      invTotalDeltaPct: n(o.inverse_total_delta_percent),
      capturePct: n(o.btc_capture_percent_of_created_market_plus_deadopop),
      inverseCapturePct: n(o.inverse_unabsorbed_percent),

      height: n(net.block_height),
      remaining: n(net.btc_remaining_to_mine),
      remainingPct: n(net.btc_remaining_to_mine_percent),
      minedYear: n(net.estimated_btc_mined_this_year),
      reward: n(net.current_block_reward_btc),
      nextReward: n(net.next_block_reward_btc),
      nextHalving: n(net.next_halving_height),
      blocksRemaining: n(net.blocks_remaining_until_halving),
      halvingAt: String(net.estimated_halving_at || ""),
      countdown: n(net.halving_countdown_seconds)
    };

    for (const value of [
      s.globalCap, s.btcCap, s.spot, s.supply, s.theoretical, s.adjusted
    ]) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid appraisal values");
      }
    }

    if (!Number.isFinite(s.deadLoss) || s.deadLoss < 0) {
      throw new Error("invalid DeadOPop cumulative loss");
    }

    if (!Number.isFinite(s.height) || s.height < 0) {
      throw new Error("invalid block height");
    }

    return s;
  }

  function saveCache(value) {
    try {
      localStorage.setItem(CFG.CACHE_KEY, JSON.stringify(value));
    } catch {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function loadRemote() {
    const errors = [];
    for (const url of apiCandidates()) {
      try {
        return normalize(await fetchJSON(url));
      } catch (error) {
        errors.push(`${url}: ${String(error?.message || error)}`);
      }
    }
    throw new Error(errors.join(" | "));
  }

  function render(root, s, source) {
    setText(root, "[data-tmbtc-headline]",
      `${fmtUSD(s.adjusted)} appraised vs ${fmtUSD(s.spot)} spot`);
    setText(root, "[data-tmbtc-sub]",
      `TheMarketBTCCreated ${fmtUSD(s.theoretical)} • DeadOPop +${fmtUSD0(s.deadLoss)}`);

    setText(root, "[data-tmbtc-time]", fmtDate(s.updatedAt));
    setText(root, "[data-tmbtc-height]", fmtInt(s.height));
    setText(root, "[data-tmbtc-global]", fmtUSD0(s.globalCap));
    setText(root, "[data-tmbtc-btccap]", fmtUSD0(s.btcCap));
    setText(root, "[data-tmbtc-alts]", fmtUSD0(s.shitcoinCap));
    setText(root, "[data-tmbtc-deado]", fmtUSD0(s.deadLoss));
    setText(root, "[data-tmbtc-deadocoverage]",
      `${fmtInt(s.deadValued)} valued / ${fmtInt(s.deadTotal)} dead ` +
      `(${fmtPct(s.deadCoverage)} coverage; ${fmtInt(s.deadUnvalued)} pending)`);

    setText(root, "[data-tmbtc-price]", fmtUSD(s.theoretical));
    setText(root, "[data-tmbtc-actual]", fmtUSD(s.spot));
    setText(root, "[data-tmbtc-delta]",
      `${fmtUSD(s.deltaUSD)} (${fmtPct(s.deltaPct)})`);
    setText(root, "[data-tmbtc-invdelta]", fmtPct(s.invDeltaPct));
    setText(root, "[data-tmbtc-total]", fmtUSD(s.adjusted));
    setText(root, "[data-tmbtc-totaldelta]",
      `${fmtUSD(s.totalDeltaUSD)} (${fmtPct(s.totalDeltaPct)})`);
    setText(root, "[data-tmbtc-invtotaldelta]", fmtPct(s.invTotalDeltaPct));
    setText(root, "[data-tmbtc-capture]",
      `${fmtPct(s.capturePct)} / ${fmtPct(s.inverseCapturePct)}`);

    setText(root, "[data-tmbtc-supply]", `${fmtFloat(s.supply)} BTC`);
    setText(root, "[data-tmbtc-remaining]",
      `${fmtFloat(s.remaining)} BTC (${fmtPct(s.remainingPct, 6)})`);
    setText(root, "[data-tmbtc-yearmine]", `${fmtFloat(s.minedYear)} BTC`);
    setText(root, "[data-tmbtc-reward]", `${fmtFloat(s.reward)} BTC`);
    setText(root, "[data-tmbtc-nextreward]", `${fmtFloat(s.nextReward)} BTC`);
    setText(root, "[data-tmbtc-halving]",
      `${fmtInt(s.nextHalving)} (remaining ${fmtInt(s.blocksRemaining)}) • ${fmtDate(s.halvingAt)}`);
    setText(root, "[data-tmbtc-countdown]", fmtCountdown(s.countdown));

    setText(root, "[data-tmbtc-status]",
      `${source} • market:${s.marketSource} • block:${s.blockSource}`);
  }

  function renderError(root, error) {
    setText(root, "[data-tmbtc-headline]", "TheMarketBTCCreated unavailable");
    setText(root, "[data-tmbtc-sub]", "no valid appraisal API");
    setText(root, "[data-tmbtc-status]", `error: ${String(error || "unknown")}`);
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    const refresh = q(root, "[data-tmbtc-refresh]");
    if (refresh) refresh.disabled = true;
    setText(root, "[data-tmbtc-status]", "refreshing…");

    try {
      const snapshot = await loadRemote();
      saveCache(snapshot);
      render(root, snapshot, "live");
    } catch (error) {
      const cached = loadCache();
      if (cached) {
        render(root, cached, "cached");
        setText(root, "[data-tmbtc-status]",
          `cached • live refresh failed: ${String(error?.message || error)}`);
      } else {
        renderError(root, String(error?.message || error));
      }
    } finally {
      inflight = false;
      if (refresh) refresh.disabled = false;
    }
  }

  function boot(root) {
    if (!root) return;

    const refresh = q(root, "[data-tmbtc-refresh]");
    if (refresh && refresh.dataset.zzxBound !== "1") {
      refresh.dataset.zzxBound = "1";
      refresh.addEventListener("click", () => update(root));
    }

    if (root.__zzxTimer) clearInterval(root.__zzxTimer);

    const cached = loadCache();
    if (cached) render(root, cached, "cached");

    update(root);
    root.__zzxTimer = setInterval(() => update(root), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, root => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, root => boot(root));
  }
})();
