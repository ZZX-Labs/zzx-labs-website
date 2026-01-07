// __partials/widgets/mining-rewards/widget.js
// DROP-IN (NEW WIDGET) — core-compatible (ZZXWidgetsCore.onMount OR legacy register)
//
// What it does:
// - Pulls BTC spot (Coinbase spot by default, or window.ZZX_API.COINBASE_SPOT if set)
// - Pulls top mining pools/miners for last ~24h from a configurable endpoint list
// - Renders top 25, paged 5 per page
// - Shows BTC + USD value + blocks
//
// NOTE:
// - Mining pool endpoints vary by provider. This script tries several common ones.
// - If you already have preferred endpoints, set them in window.ZZX_API:
//     ZZX_API.MINING_POOLS_24H = "https://..."
//   or:
//     ZZX_API.MINING_POOLS_24H_CANDIDATES = ["https://...", "https://..."]
//
// No new files, no new routes. Safe on reinjection.

(function () {
  "use strict";

  const W = window;

  const ID = "mining-rewards";

  // ---------- Config / endpoints ----------
  const DEFAULTS = {
    COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",

    // Candidate endpoints (first that returns usable data wins)
    // These are "best effort" defaults; override via ZZX_API for your stack.
    MINING_POOLS_24H_CANDIDATES: [
      "https://mempool.space/api/v1/mining/pools/24h",
      "https://mempool.space/api/v1/mining/pools/1d",
      "https://mempool.space/api/v1/mining/pools",
    ],

    // How many to keep + page size
    TOP_N: 25,
    PAGE_SIZE: 5,

    // Refresh cadence
    REFRESH_MS: 60_000,
  };

  function getSpotUrl() {
    const u = W.ZZX_API && typeof W.ZZX_API.COINBASE_SPOT === "string" ? W.ZZX_API.COINBASE_SPOT : "";
    return u || DEFAULTS.COINBASE_SPOT;
  }

  function getMiningCandidates() {
    const api = W.ZZX_API || {};
    if (typeof api.MINING_POOLS_24H === "string" && api.MINING_POOLS_24H.trim()) {
      return [api.MINING_POOLS_24H.trim()];
    }
    if (Array.isArray(api.MINING_POOLS_24H_CANDIDATES) && api.MINING_POOLS_24H_CANDIDATES.length) {
      return api.MINING_POOLS_24H_CANDIDATES.map(String).map((s) => s.trim()).filter(Boolean);
    }
    return DEFAULTS.MINING_POOLS_24H_CANDIDATES.slice();
  }

  // ---------- Utils ----------
  function n2(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtUSD(x) {
    const v = n2(x);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtBTC(x) {
    const v = n2(x);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  async function fetchJSON(core, url) {
    // core.fetchJSON exists and is prefix-aware for site-relative paths;
    // for absolute URLs it's still fine. Fallback to fetch otherwise.
    if (core && typeof core.fetchJSON === "function") {
      return await core.fetchJSON(url);
    }
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  }

  // ---------- Data adapters (tolerant parsing) ----------
  // We try to coerce whatever shape we get into:
  //   { name, blocks, btc }
  function normalizePoolsPayload(payload) {
    // Common case: array already
    let arr = payload;

    // Some APIs return { pools: [...] } or { data: [...] } etc.
    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      if (Array.isArray(payload.pools)) arr = payload.pools;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.items)) arr = payload.items;
      else if (Array.isArray(payload.results)) arr = payload.results;
    }

    if (!Array.isArray(arr)) return [];

    const out = [];

    for (const it of arr) {
      if (!it || typeof it !== "object") continue;

      const name =
        String(
          it.name ??
            it.poolName ??
            it.pool ??
            it.slug ??
            it.id ??
            it.tag ??
            "Unknown"
        );

      // blocks might be "blocks", "blockCount", "count", "nBlocks"
      const blocks = n2(it.blocks ?? it.blockCount ?? it.count ?? it.nBlocks ?? it.blocksMined);

      // reward in BTC might exist directly
      let btc = n2(it.btc ?? it.rewardBtc ?? it.totalBtc ?? it.total_reward_btc);

      // or reward in sats
      if (!Number.isFinite(btc)) {
        const sats = n2(it.sats ?? it.rewardSats ?? it.totalSats ?? it.total_reward_sats ?? it.totalReward ?? it.total_reward);
        if (Number.isFinite(sats)) btc = sats / 1e8;
      }

      // sometimes reward is split (subsidy + fees)
      if (!Number.isFinite(btc)) {
        const subSats = n2(it.subsidySats ?? it.subsidy ?? it.blockSubsidy ?? it.totalSubsidy);
        const feeSats = n2(it.feesSats ?? it.fees ?? it.totalFees ?? it.total_fees);
        const sum = (Number.isFinite(subSats) ? subSats : 0) + (Number.isFinite(feeSats) ? feeSats : 0);
        if (sum > 0) btc = sum / 1e8;
      }

      // If still missing BTC, we can approximate via blocks * 3.125 (post-2024 halving)
      // but only if blocks is present; keep clearly "approx" via subtext later if needed.
      const approx = !Number.isFinite(btc) && Number.isFinite(blocks) && blocks > 0;
      if (approx) btc = blocks * 3.125;

      out.push({
        name,
        blocks: Number.isFinite(blocks) ? blocks : NaN,
        btc: Number.isFinite(btc) ? btc : NaN,
        _approx: approx,
      });
    }

    // Sort descending by BTC if possible, else by blocks
    out.sort((a, b) => {
      const ab = a.btc, bb = b.btc;
      if (Number.isFinite(bb) && Number.isFinite(ab)) return bb - ab;
      const ak = a.blocks, bk = b.blocks;
      if (Number.isFinite(bk) && Number.isFinite(ak)) return bk - ak;
      return String(a.name).localeCompare(String(b.name));
    });

    return out;
  }

  async function getSpot(core) {
    const spotUrl = getSpotUrl();
    const data = await fetchJSON(core, spotUrl);
    const amt = n2(data && data.data && data.data.amount);
    if (!Number.isFinite(amt)) throw new Error("spot parse failed");
    return amt;
  }

  async function getPools24h(core) {
    const candidates = getMiningCandidates();
    let lastErr = null;

    for (const u of candidates) {
      try {
        const payload = await fetchJSON(core, u);
        const rows = normalizePoolsPayload(payload);
        if (rows && rows.length) return { rows, source: u };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("no mining source returned usable data");
  }

  // ---------- Render ----------
  function render(root, state) {
    const rowsHost = root.querySelector("[data-mr-rows]");
    const pageEl = root.querySelector("[data-mr-page]");
    const subEl = root.querySelector("[data-mr-sub]");
    const sumEl = root.querySelector("[data-mr-summary]");

    if (!rowsHost) return;

    const rows = state.rows || [];
    const total = rows.length;
    const pageSize = DEFAULTS.PAGE_SIZE;
    const pages = Math.max(1, Math.ceil(Math.min(total, DEFAULTS.TOP_N) / pageSize));
    state.page = clamp(state.page || 0, 0, pages - 1);

    const start = state.page * pageSize;
    const end = Math.min(start + pageSize, Math.min(total, DEFAULTS.TOP_N));
    const slice = rows.slice(start, end);

    // Update header/sub
    if (sumEl) sumEl.textContent = "Top block reward earners (24h)";
    if (subEl) {
      const src = state.source ? String(state.source) : "unknown source";
      const approxNote = slice.some((r) => r._approx) ? " (some BTC values approximated)" : "";
      subEl.textContent = `Source: ${src}${approxNote}`;
    }

    if (pageEl) pageEl.textContent = `Page ${state.page + 1} / ${pages}`;

    // Clear + paint
    rowsHost.innerHTML = "";

    for (let i = 0; i < slice.length; i++) {
      const r = slice[i];
      const rank = start + i + 1;

      const btc = r.btc;
      const usd = Number.isFinite(btc) && Number.isFinite(state.spotUsd) ? (btc * state.spotUsd) : NaN;

      const row = document.createElement("div");
      row.className = "zzx-mr-row";
      row.setAttribute("role", "row");

      // cells
      const c1 = document.createElement("div");
      c1.className = "zzx-mr-cell";
      c1.setAttribute("role", "cell");
      c1.textContent = String(rank);

      const c2 = document.createElement("div");
      c2.className = "zzx-mr-cell";
      c2.setAttribute("role", "cell");
      c2.textContent = r.name;

      const c3 = document.createElement("div");
      c3.className = "zzx-mr-cell zzx-mr-num";
      c3.setAttribute("role", "cell");
      c3.textContent = fmtBTC(btc);

      const c4 = document.createElement("div");
      c4.className = "zzx-mr-cell zzx-mr-num";
      c4.setAttribute("role", "cell");
      c4.textContent = Number.isFinite(usd) ? fmtUSD(usd) : "—";

      const c5 = document.createElement("div");
      c5.className = "zzx-mr-cell zzx-mr-num";
      c5.setAttribute("role", "cell");
      c5.textContent = Number.isFinite(r.blocks) ? String(Math.round(r.blocks)) : "—";

      row.appendChild(c1);
      row.appendChild(c2);
      row.appendChild(c3);
      row.appendChild(c4);
      row.appendChild(c5);

      rowsHost.appendChild(row);
    }

    // Enable/disable pager
    const prev = root.querySelector("[data-mr-prev]");
    const next = root.querySelector("[data-mr-next]");
    if (prev) prev.disabled = (state.page <= 0);
    if (next) next.disabled = (state.page >= pages - 1);
  }

  // ---------- Boot / lifecycle ----------
  function boot(root, core) {
    if (!root) return;

    // Prevent double timers on reinjection
    if (root.__zzxMrTimer) {
      clearInterval(root.__zzxMrTimer);
      root.__zzxMrTimer = null;
    }

    const state = {
      page: 0,
      rows: [],
      source: "",
      spotUsd: NaN,
      inflight: false,
    };

    async function refresh() {
      if (state.inflight) return;
      state.inflight = true;

      try {
        const [spot, pools] = await Promise.all([
          getSpot(core),
          getPools24h(core),
        ]);

        state.spotUsd = spot;
        state.rows = (pools.rows || []).slice();
        state.source = pools.source || "";

        render(root, state);
      } catch (e) {
        const subEl = root.querySelector("[data-mr-sub]");
        if (subEl) subEl.textContent = `error: ${String(e && e.message ? e.message : e)}`;
      } finally {
        state.inflight = false;
      }
    }

    // Pager handlers (bind once per root)
    const prev = root.querySelector("[data-mr-prev]");
    const next = root.querySelector("[data-mr-next]");
    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        state.page = Math.max(0, (state.page || 0) - 1);
        render(root, state);
      });
    }
    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        state.page = (state.page || 0) + 1;
        render(root, state);
      });
    }

    // Initial + interval
    refresh();
    root.__zzxMrTimer = setInterval(refresh, DEFAULTS.REFRESH_MS);
  }

  // Preferred: core lifecycle (fires AFTER HTML is injected)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
    return;
  }

  // Fallback: legacy registry
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, core) {
      boot(root, core);
    });
  }
})();
