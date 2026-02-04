// __partials/widgets/themarketbtccreated/widget.js

(function () {
  "use strict";

  const W = window;
  const ID = "themarketbtccreated";

  const CFG = {
    REFRESH_MS: 120_000,
    TIMEOUT_MS: 20_000,
    CACHE_TTL_MS: 60_000,
    CACHE_KEY: "zzx:themarketbtccreated:last",
    ENDPOINT_PRIMARY: "/api/themarketbtccreated",
    ENDPOINT_FALLBACK: null,
  };

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) { const el = q(root, sel); if (el) el.textContent = String(text ?? "—"); }

  function withTimeout(p, ms) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error("timeout after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  function cacheRead() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (Date.now() - obj.t) > CFG.CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch {
      return null;
    }
  }

  function cacheWrite(v) {
    try {
      localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ t: Date.now(), v }));
    } catch { }
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "same-origin", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status + " for " + url + ": " + (t || "no body"));
    try { return JSON.parse(String(t).trim()); }
    catch { throw new Error("JSON.parse failed for " + url); }
  }

  async function fetchSnapshot() {
    try {
      const j = await withTimeout(fetchJSON(CFG.ENDPOINT_PRIMARY), CFG.TIMEOUT_MS);
      cacheWrite(j);
      return { json: j, from: "primary" };
    } catch (e1) {
      if (CFG.ENDPOINT_FALLBACK) {
        try {
          const j = await withTimeout(fetchJSON(CFG.ENDPOINT_FALLBACK), CFG.TIMEOUT_MS);
          cacheWrite(j);
          return { json: j, from: "fallback" };
        } catch (e2) {
          const c = cacheRead();
          if (c) return { json: c, from: "cache" };
          throw new Error(String(e1?.message || e1) + " | " + String(e2?.message || e2));
        }
      }
      const c = cacheRead();
      if (c) return { json: c, from: "cache" };
      throw e1;
    }
  }

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtUSD(v, d = 2) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtUSD0(v) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function fmtInt(v) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return Math.trunc(x).toLocaleString();
  }

  function fmtFloat(v, d = 8) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtPct(v, d = 2) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return x.toFixed(d) + "%";
  }

  function fmtCountdown(secTotal) {
    const s = Math.max(0, Math.trunc(n(secTotal) || 0));
    const days = Math.floor(s / 86400);
    const rem1 = s - days * 86400;
    const hrs = Math.floor(rem1 / 3600);
    const rem2 = rem1 - hrs * 3600;
    const mins = Math.floor(rem2 / 60);
    const secs = rem2 - mins * 60;
    return `${days}d ${hrs}h ${mins}m ${secs}s`;
  }

  function render(root, data, from) {
    const timeStr = data.time ?? data.timestamp ?? "—";
    setText(root, "[data-tmbtc-time]", timeStr);
    setText(root, "[data-tmbtc-height]", fmtInt(data.block_height));

    setText(root, "[data-tmbtc-global]", fmtUSD0(data.global_market_cap_usd));
    setText(root, "[data-tmbtc-btccap]", fmtUSD0(data.btc_market_cap_usd));
    setText(root, "[data-tmbtc-alts]", fmtUSD0(data.shitcoin_market_cap_usd));
    setText(root, "[data-tmbtc-deado]", fmtUSD0(data.deado_market_cap_usd));

    setText(root, "[data-tmbtc-price]", fmtUSD(data.btc_price_usd, 2));
    setText(root, "[data-tmbtc-actual]", fmtUSD(data.actual_btc_price_usd, 2));

    const deltaUsd = data.delta_usd;
    const deltaPct = data.delta_percent;
    setText(root, "[data-tmbtc-delta]", `${fmtUSD(deltaUsd, 2)} (${fmtPct(deltaPct, 2)})`);

    const inv = data.inverse_delta_percent;
    setText(root, "[data-tmbtc-invdelta]", fmtPct(inv, 2));

    const tot = data.total_btc_price_inc_deado_usd;
    setText(root, "[data-tmbtc-total]", fmtUSD(tot, 2));

    const tdu = data.total_delta_usd;
    const tdp = data.total_delta_percent;
    setText(root, "[data-tmbtc-totaldelta]", `${fmtUSD(tdu, 2)} (${fmtPct(tdp, 2)})`);

    const itd = data.inverse_total_delta_percent;
    setText(root, "[data-tmbtc-invtotaldelta]", fmtPct(itd, 2));

    setText(root, "[data-tmbtc-supply]", fmtFloat(data.btc_circulating_supply_btc, 8));

    const rem = data.remaining_btc_to_mine_btc;
    const remPct = data.remaining_btc_to_mine_percent;
    setText(root, "[data-tmbtc-remaining]", `${fmtFloat(rem, 8)} (${fmtPct(remPct, 6)})`);

    setText(root, "[data-tmbtc-yearmine]", fmtFloat(data.estimated_btc_mined_this_year_btc, 8));

    setText(root, "[data-tmbtc-reward]", fmtFloat(data.current_block_reward_btc, 8) + " BTC");
    setText(root, "[data-tmbtc-nextreward]", fmtFloat(data.next_block_reward_btc, 8) + " BTC");

    const nh = fmtInt(data.next_halving_height);
    const br = fmtInt(data.blocks_remaining_until_halving);
    const hd = data.estimated_halving_date ?? "—";
    setText(root, "[data-tmbtc-halving]", `${nh} (remaining ${br}) • ${hd}`);

    if (data.halving_countdown_seconds != null) {
      setText(root, "[data-tmbtc-countdown]", fmtCountdown(data.halving_countdown_seconds));
    } else if (data.countdown_to_halving != null) {
      setText(root, "[data-tmbtc-countdown]", String(data.countdown_to_halving));
    } else {
      setText(root, "[data-tmbtc-countdown]", "—");
    }

    const headline = `${fmtUSD(data.actual_btc_price_usd, 2)} theoretical vs ${fmtUSD(data.btc_price_usd, 2)} spot`;
    setText(root, "[data-tmbtc-headline]", headline);

    setText(root, "[data-tmbtc-sub]", "source: " + String(from || "—"));
    setText(root, "[data-tmbtc-status]", "ok");
  }

  function renderError(root, msg) {
    setText(root, "[data-tmbtc-headline]", "—");
    setText(root, "[data-tmbtc-sub]", "error: " + String(msg || "unknown"));
    setText(root, "[data-tmbtc-status]", "error");
  }

  async function update(root) {
    if (!root) return;
    try {
      setText(root, "[data-tmbtc-status]", "loading");
      const { json, from } = await fetchSnapshot();
      render(root, json || {}, from);
    } catch (e) {
      renderError(root, String(e?.message || e));
    }
  }

  function wire(root) {
    const refresh = q(root, "[data-tmbtc-refresh]");
    if (refresh && refresh.dataset.zzxBound !== "1") {
      refresh.dataset.zzxBound = "1";
      refresh.addEventListener("click", () => update(root));
    }
  }

  function boot(root) {
    if (!root) return;

    wire(root);

    if (root.__zzxTimer) {
      clearInterval(root.__zzxTimer);
      root.__zzxTimer = null;
    }

    update(root);
    root.__zzxTimer = setInterval(() => update(root), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
