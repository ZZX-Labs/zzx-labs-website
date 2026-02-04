// __partials/widgets/themarketbtccreated/widget.js
// Client-native version of themarketbtccreated.py
//
// Data sources (direct first; AllOrigins fallback):
// - CoinGecko global: /api/v3/global
// - CoinGecko BTC spot: /api/v3/simple/price?ids=bitcoin&vs_currencies=usd
// - blockchain.info total supply: https://blockchain.info/q/totalbc
// - blockchain.info block height: https://blockchain.info/q/getblockcount
//
// Deado market cap source (preferred):
// - /deado.json (produced by deadopop widget export + publish)
// Fallback:
// - localStorage built by deadopop widget
//
// No backend required.

(function () {
  "use strict";

  const W = window;
  const ID = "themarketbtccreated";

  const CFG = {
    REFRESH_MS: 120_000,
    TIMEOUT_MS: 20_000,

    COINGECKO_BASE: "https://api.coingecko.com/api/v3",
    AO_RAW: "https://api.allorigins.win/raw?url=",

    BLOCKCHAIN_TOTALBC: "https://blockchain.info/q/totalbc",
    BLOCKCHAIN_HEIGHT: "https://blockchain.info/q/getblockcount",

    TOTAL_SUPPLY_BTC: 21000000.0,
    HALVING_INTERVAL: 210000,
    BLOCK_TIME_SECONDS: 600,

    DEADO_URL: "/deado.json",
    DEADO_LOCAL_KEY: "zzx:deadopop:dataset",

    CACHE_TTL_MS: 60_000,
    CACHE_PREFIX: "zzx:themarketbtccreated:",
  };

  let inflight = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) {
    const el = q(root, sel);
    if (el) el.textContent = String(text ?? "—");
  }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  function snip(s, n = 180) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function looksLikeHTML(text) {
    const s = String(text || "").trim().toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body");
  }

  function cacheKey(url) {
    return CFG.CACHE_PREFIX + encodeURIComponent(String(url || ""));
  }

  function cacheRead(url) {
    try {
      const raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (Date.now() - obj.t) > CFG.CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch {
      return null;
    }
  }

  function cacheWrite(url, value) {
    try {
      localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), v: value }));
    } catch { }
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} for ${url}: ${snip(t) || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  async function fetchJSONRobust(url, label) {
    const txt = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label || "fetch");
    if (looksLikeHTML(txt)) throw new Error(`Non-JSON (HTML) from ${url}: ${snip(txt)}`);
    try {
      return JSON.parse(String(txt).trim());
    } catch {
      throw new Error(`JSON.parse failed for ${url}: ${snip(txt)}`);
    }
  }

  async function fetchJSONDirectThenAO(url, label) {
    try {
      const j = await fetchJSONRobust(url, label ? `${label} (direct)` : "direct");
      cacheWrite(url, j);
      return { json: j, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const j = await fetchJSONRobust(ao, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, j);
        return { json: j, from: "allorigins" };
      } catch (e2) {
        const cached = cacheRead(url);
        if (cached != null) return { json: cached, from: "cache" };
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  async function fetchTextDirectThenAO(url, label) {
    try {
      const txt = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label ? `${label} (direct)` : "direct");
      cacheWrite(url, txt);
      return { text: txt, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const txt = await withTimeout(fetchText(ao), CFG.TIMEOUT_MS, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, txt);
        return { text: txt, from: "allorigins" };
      } catch (e2) {
        const cached = cacheRead(url);
        if (cached != null) return { text: cached, from: "cache" };
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  function toNum(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtInt(n) { return Number.isFinite(n) ? Math.trunc(n).toLocaleString() : "—"; }

  function fmtUSD(n, d = 2) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtUSD0(n) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function fmtFloat(n, d = 8) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtPct(n, d = 2) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return x.toFixed(d) + "%";
  }

  function fmtCountdownSeconds(totalSeconds) {
    const s = Math.max(0, Math.trunc(toNum(totalSeconds) || 0));
    const days = Math.floor(s / 86400);
    const rem1 = s - days * 86400;
    const hrs = Math.floor(rem1 / 3600);
    const rem2 = rem1 - hrs * 3600;
    const mins = Math.floor(rem2 / 60);
    const secs = rem2 - mins * 60;
    return `${days}d ${hrs}h ${mins}m ${secs}s`;
  }

  async function getGlobalMarketCapUSD() {
    const url = CFG.COINGECKO_BASE + "/global";
    const res = await fetchJSONDirectThenAO(url, "coingecko global");
    const cap = res?.json?.data?.total_market_cap?.usd;
    return { value: toNum(cap), from: res.from };
  }

  async function getBTCSpotUSD() {
    const url = CFG.COINGECKO_BASE + "/simple/price?ids=bitcoin&vs_currencies=usd";
    const res = await fetchJSONDirectThenAO(url, "coingecko btc spot");
    const p = res?.json?.bitcoin?.usd;
    return { value: toNum(p), from: res.from };
  }

  async function getBTCSupplyBTCText() {
    const res = await fetchTextDirectThenAO(CFG.BLOCKCHAIN_TOTALBC, "blockchain totalbc");
    const sat = toNum(String(res.text || "").trim());
    const btc = Number.isFinite(sat) ? (sat / 1e8) : NaN;
    return { value: btc, from: res.from };
  }

  async function getBTCBlockHeight() {
    const res = await fetchTextDirectThenAO(CFG.BLOCKCHAIN_HEIGHT, "blockchain height");
    const h = toNum(String(res.text || "").trim());
    return { value: Number.isFinite(h) ? Math.trunc(h) : NaN, from: res.from };
  }

  async function getDeadoCapUSD() {
    // Preferred: published /deado.json
    try {
      const res = await fetchJSONDirectThenAO(CFG.DEADO_URL, "deado.json");
      const cap = toNum(res?.json?.total_peak_market_cap_usd);
      if (Number.isFinite(cap) && cap >= 0) return { value: cap, from: "deado.json" };
    } catch { }

    // Fallback: localStorage dataset built by deadopop widget
    try {
      const raw = localStorage.getItem(CFG.DEADO_LOCAL_KEY);
      if (!raw) return { value: 0, from: "none" };
      const obj = JSON.parse(raw);
      const cap = toNum(obj?.total_peak_market_cap_usd);
      if (Number.isFinite(cap) && cap >= 0) return { value: cap, from: "local" };
    } catch { }

    return { value: 0, from: "none" };
  }

  function computeSnapshot(inputs) {
    const now = new Date();
    const timestamp = now.getFullYear().toString().padStart(4, "0") + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0") + " " +
      String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0") + ":" +
      String(now.getSeconds()).padStart(2, "0");

    const globalCap = inputs.globalCap;
    const spotBTC = inputs.spotBTC;
    const btcSupply = inputs.btcSupply;
    const height = inputs.height;
    const deadoCap = inputs.deadoCap;

    // Spot BTC market cap (spot * circulating)
    const btcCap = (Number.isFinite(spotBTC) && Number.isFinite(btcSupply)) ? (spotBTC * btcSupply) : NaN;

    // "Shitcoin market cap" is everything non-BTC inside global
    const shitcoinCap = (Number.isFinite(globalCap) && Number.isFinite(btcCap)) ? (globalCap - btcCap) : NaN;

    // Theoretical BTC price if BTC captured entire global market cap
    const theoreticalBTC = (Number.isFinite(globalCap) && Number.isFinite(btcSupply) && btcSupply > 0) ? (globalCap / btcSupply) : NaN;

    // Total theoretical including deado
    const totalBTCPrice = (Number.isFinite(globalCap) && Number.isFinite(deadoCap) && Number.isFinite(btcSupply) && btcSupply > 0)
      ? ((globalCap + deadoCap) / btcSupply)
      : NaN;

    // Delta = theoretical - spot
    const delta = (Number.isFinite(theoreticalBTC) && Number.isFinite(spotBTC)) ? (theoreticalBTC - spotBTC) : NaN;
    const deltaPct = (Number.isFinite(delta) && Number.isFinite(spotBTC) && spotBTC !== 0) ? ((delta / spotBTC) * 100) : NaN;
    const invDeltaPct = Number.isFinite(deltaPct) ? (-deltaPct) : NaN;

    const totalDelta = (Number.isFinite(totalBTCPrice) && Number.isFinite(spotBTC)) ? (totalBTCPrice - spotBTC) : NaN;
    const totalDeltaPct = (Number.isFinite(totalDelta) && Number.isFinite(spotBTC) && spotBTC !== 0) ? ((totalDelta / spotBTC) * 100) : NaN;
    const invTotalDeltaPct = Number.isFinite(totalDeltaPct) ? (-totalDeltaPct) : NaN;

    const totalSupply = CFG.TOTAL_SUPPLY_BTC;
    const remainingSupply = Number.isFinite(btcSupply) ? (totalSupply - btcSupply) : NaN;
    const remainingPct = (Number.isFinite(remainingSupply) && totalSupply > 0) ? ((remainingSupply / totalSupply) * 100) : NaN;

    let epoch = NaN;
    let currentReward = NaN;
    let nextReward = NaN;
    let nextHalvingHeight = NaN;
    let blocksRemaining = NaN;
    let estHalvingDate = null;
    let countdownSeconds = NaN;

    if (Number.isFinite(height) && height >= 0) {
      epoch = Math.floor(height / CFG.HALVING_INTERVAL);
      currentReward = 50 / Math.pow(2, epoch);
      nextReward = currentReward / 2;
      nextHalvingHeight = (epoch + 1) * CFG.HALVING_INTERVAL;
      blocksRemaining = nextHalvingHeight - height;

      if (Number.isFinite(blocksRemaining) && blocksRemaining >= 0) {
        countdownSeconds = Math.trunc(blocksRemaining * CFG.BLOCK_TIME_SECONDS);
        estHalvingDate = new Date(Date.now() + (countdownSeconds * 1000));
      }
    }

    // Estimate BTC mined for rest of current calendar year
    let estMinedThisYear = NaN;
    if (Number.isFinite(currentReward)) {
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      const secondsLeft = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      const blocksLeft = (secondsLeft / 86400) * 144;
      estMinedThisYear = blocksLeft * currentReward;
    }

    function fmtDate(dt) {
      if (!(dt instanceof Date) || isNaN(dt.getTime())) return "—";
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      const ss = String(dt.getSeconds()).padStart(2, "0");
      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }

    return {
      time: timestamp,
      block_height: height,

      global_market_cap_usd: globalCap,

      // IMPORTANT SEMANTICS (match UI labels):
      // BTC Price            => theoretical
      // Actual BTC Price     => spot
      btc_price_usd: theoreticalBTC,
      actual_btc_price_usd: spotBTC,

      btc_circulating_supply_btc: btcSupply,

      btc_market_cap_usd: btcCap,
      shitcoin_market_cap_usd: shitcoinCap,
      deado_market_cap_usd: deadoCap,

      delta_usd: delta,
      delta_percent: deltaPct,
      inverse_delta_percent: invDeltaPct,

      total_btc_price_inc_deado_usd: totalBTCPrice,
      total_delta_usd: totalDelta,
      total_delta_percent: totalDeltaPct,
      inverse_total_delta_percent: invTotalDeltaPct,

      remaining_btc_to_mine_btc: remainingSupply,
      remaining_btc_to_mine_percent: remainingPct,
      estimated_btc_mined_this_year_btc: estMinedThisYear,

      current_block_reward_btc: currentReward,
      next_block_reward_btc: nextReward,
      next_halving_height: nextHalvingHeight,
      blocks_remaining_until_halving: blocksRemaining,
      estimated_halving_date: fmtDate(estHalvingDate),
      halving_countdown_seconds: countdownSeconds,
    };
  }

  function render(root, snap, sources) {
    const headline = Number.isFinite(snap.btc_price_usd) && Number.isFinite(snap.actual_btc_price_usd)
      ? `${fmtUSD(snap.btc_price_usd, 2)} theoretical vs ${fmtUSD(snap.actual_btc_price_usd, 2)} spot`
      : "—";

    setText(root, "[data-tmbtc-headline]", headline);

    const src = [
      sources.globalCap ? `global:${sources.globalCap}` : null,
      sources.spotBTC ? `spot:${sources.spotBTC}` : null,
      sources.btcSupply ? `supply:${sources.btcSupply}` : null,
      sources.height ? `height:${sources.height}` : null,
      sources.deado ? `deado:${sources.deado}` : null,
    ].filter(Boolean).join(" | ");

    setText(root, "[data-tmbtc-sub]", src || "—");

    setText(root, "[data-tmbtc-time]", snap.time);
    setText(root, "[data-tmbtc-height]", fmtInt(snap.block_height));

    setText(root, "[data-tmbtc-global]", fmtUSD0(snap.global_market_cap_usd));
    setText(root, "[data-tmbtc-btccap]", fmtUSD0(snap.btc_market_cap_usd));
    setText(root, "[data-tmbtc-alts]", fmtUSD0(snap.shitcoin_market_cap_usd));
    setText(root, "[data-tmbtc-deado]", fmtUSD0(snap.deado_market_cap_usd));

    // UI labels:
    // BTC Price => theoretical
    // Actual BTC Price => spot
    setText(root, "[data-tmbtc-price]", fmtUSD(snap.btc_price_usd, 2));
    setText(root, "[data-tmbtc-actual]", fmtUSD(snap.actual_btc_price_usd, 2));

    setText(root, "[data-tmbtc-delta]", `${fmtUSD(snap.delta_usd, 2)} (${fmtPct(snap.delta_percent, 2)})`);
    setText(root, "[data-tmbtc-invdelta]", fmtPct(snap.inverse_delta_percent, 2));

    setText(root, "[data-tmbtc-total]", fmtUSD(snap.total_btc_price_inc_deado_usd, 2));
    setText(root, "[data-tmbtc-totaldelta]", `${fmtUSD(snap.total_delta_usd, 2)} (${fmtPct(snap.total_delta_percent, 2)})`);
    setText(root, "[data-tmbtc-invtotaldelta]", fmtPct(snap.inverse_total_delta_percent, 2));

    setText(root, "[data-tmbtc-supply]", fmtFloat(snap.btc_circulating_supply_btc, 8));

    const remStr = `${fmtFloat(snap.remaining_btc_to_mine_btc, 8)} (${fmtPct(snap.remaining_btc_to_mine_percent, 6)})`;
    setText(root, "[data-tmbtc-remaining]", remStr);

    setText(root, "[data-tmbtc-yearmine]", fmtFloat(snap.estimated_btc_mined_this_year_btc, 8));

    setText(root, "[data-tmbtc-reward]", fmtFloat(snap.current_block_reward_btc, 8) + " BTC");
    setText(root, "[data-tmbtc-nextreward]", fmtFloat(snap.next_block_reward_btc, 8) + " BTC");

    const halvingLine = `${fmtInt(snap.next_halving_height)} (remaining ${fmtInt(snap.blocks_remaining_until_halving)}) • ${snap.estimated_halving_date}`;
    setText(root, "[data-tmbtc-halving]", halvingLine);

    setText(root, "[data-tmbtc-countdown]", fmtCountdownSeconds(snap.halving_countdown_seconds));

    setText(root, "[data-tmbtc-status]", "ok");
  }

  function renderError(root, msg) {
    setText(root, "[data-tmbtc-headline]", "—");
    setText(root, "[data-tmbtc-sub]", "error: " + String(msg || "unknown"));
    setText(root, "[data-tmbtc-status]", "error");
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-tmbtc-status]", "loading");

      const [g, p, s, h, d] = await Promise.all([
        getGlobalMarketCapUSD(),
        getBTCSpotUSD(),
        getBTCSupplyBTCText(),
        getBTCBlockHeight(),
        getDeadoCapUSD(),
      ]);

      const snap = computeSnapshot({
        globalCap: g.value,
        spotBTC: p.value,
        btcSupply: s.value,
        height: h.value,
        deadoCap: d.value,
      });

      render(root, snap, {
        globalCap: g.from,
        spotBTC: p.from,
        btcSupply: s.from,
        height: h.from,
        deado: d.from,
      });
    } catch (e) {
      renderError(root, String(e?.message || e));
    } finally {
      inflight = false;
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
