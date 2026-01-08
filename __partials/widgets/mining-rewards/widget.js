// __partials/widgets/mining-rewards/widget.js
// DROP-IN REPLACEMENT — mining-rewards
// - Ensures deps: sources.js, fetch.js (auto-load from same dir)
// - Uses mempool.space mining pools endpoints via AllOrigins (through core.fetchJSON/ZZXAO fallback)
// - Paged leaderboard: 5 per page, top 25
// - Estimates BTC and USD (spot) per pool/miner; flags approximations in subtext

(function () {
  "use strict";

  const W = window;
  const ID = "mining-rewards";

  const TOP_N = 25;
  const PAGE_SIZE = 5;

  const NET_MIN_MS = 30_000;   // don’t hammer endpoints
  const UI_TICK_MS = 750;      // snappy buttons, slow net gate

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function fmtBTC(x){
    const v = n2(x);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
  }

  function fmtUSD0(x){
    const v = n2(x);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function widgetBasePath(){
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/mining-rewards/";
  }

  async function loadScriptOnce(url, key){
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      await new Promise(r=>setTimeout(r,0));
      return true;
    }
    return await new Promise((resolve)=>{
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = ()=>resolve(true);
      s.onerror = ()=>resolve(false);
      document.head.appendChild(s);
    });
  }

  async function ensureDeps(){
    const base = widgetBasePath();

    if (!W.ZZXMiningRewardSources?.list){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:mining-rewards:sources");
      if (!ok) return { ok:false, why:"sources.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXMiningRewardSources?.list) return { ok:false, why:"sources.js did not register" };
    }

    if (!W.ZZXMiningRewardsFetch?.fetchPools24h){
      const ok = await loadScriptOnce(base+"fetch.js", "zzx:mining-rewards:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXMiningRewardsFetch?.fetchPools24h) return { ok:false, why:"fetch.js did not register" };
    }

    return { ok:true };
  }

  function render(root, st){
    const sumEl  = root.querySelector("[data-mr-summary]");
    const subEl  = root.querySelector("[data-mr-sub]");
    const bodyEl = root.querySelector("[data-mr-body]");
    const pageEl = root.querySelector("[data-mr-page]");
    const prev   = root.querySelector("[data-mr-prev]");
    const next   = root.querySelector("[data-mr-next]");

    if (!bodyEl) return;

    const rows = Array.isArray(st.rows) ? st.rows.slice(0, TOP_N) : [];
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    st.page = clamp(st.page || 0, 0, pages - 1);

    const start = st.page * PAGE_SIZE;
    const end   = Math.min(start + PAGE_SIZE, rows.length);
    const slice = rows.slice(start, end);

    // Summary
    const totalBlocks = rows.reduce((a,r)=>a + (Number.isFinite(r.blocks)?r.blocks:0), 0);
    const totalBtc    = rows.reduce((a,r)=>a + (Number.isFinite(r.btc)?r.btc:0), 0);

    if (sumEl){
      const usd = (Number.isFinite(st.spotUsd) ? totalBtc * st.spotUsd : NaN);
      sumEl.textContent =
        Number.isFinite(usd)
          ? `Top ${rows.length} · ~${fmtBTC(totalBtc)} BTC · ~$${fmtUSD0(usd)}`
          : `Top ${rows.length} · ~${fmtBTC(totalBtc)} BTC`;
    }

    if (subEl){
      const approxAny = rows.some(r => r && r._approx);
      const src = st.source ? `Source: ${st.source}` : "Source: —";
      const spot = Number.isFinite(st.spotUsd) ? ` · Spot: $${fmtUSD0(st.spotUsd)}` : "";
      const note = approxAny ? " · includes approximations" : "";
      const blocksNote = totalBlocks ? ` · Blocks: ${Math.round(totalBlocks)}` : "";
      subEl.textContent = `${src}${spot}${blocksNote}${note}`;
    }

    if (pageEl) pageEl.textContent = `Page ${st.page + 1} / ${pages}`;
    if (prev) prev.disabled = (st.page <= 0);
    if (next) next.disabled = (st.page >= pages - 1);

    // Body rows
    bodyEl.innerHTML = "";
    for (let i = 0; i < slice.length; i++){
      const r = slice[i];
      const rank = start + i + 1;

      const btc = r.btc;
      const usd = (Number.isFinite(btc) && Number.isFinite(st.spotUsd)) ? btc * st.spotUsd : NaN;

      const row = document.createElement("div");
      row.className = "zzx-mr-row";
      row.setAttribute("role","row");

      const cRank = document.createElement("div");
      cRank.className = "zzx-mr-cell";
      cRank.setAttribute("role","cell");
      cRank.textContent = String(rank);

      const cName = document.createElement("div");
      cName.className = "zzx-mr-cell";
      cName.setAttribute("role","cell");
      cName.textContent = String(r.name || "Unknown");

      const cBlocks = document.createElement("div");
      cBlocks.className = "zzx-mr-cell zzx-mr-num";
      cBlocks.setAttribute("role","cell");
      cBlocks.textContent = Number.isFinite(r.blocks) ? String(Math.round(r.blocks)) : "—";

      const cBTC = document.createElement("div");
      cBTC.className = "zzx-mr-cell zzx-mr-num";
      cBTC.setAttribute("role","cell");
      cBTC.textContent = fmtBTC(btc);

      const cUSD = document.createElement("div");
      cUSD.className = "zzx-mr-cell zzx-mr-num";
      cUSD.setAttribute("role","cell");
      cUSD.textContent = Number.isFinite(usd) ? fmtUSD0(usd) : "—";

      // IMPORTANT: match your header order: # | Pool | Blocks | Est BTC | Est USD
      row.appendChild(cRank);
      row.appendChild(cName);
      row.appendChild(cBlocks);
      row.appendChild(cBTC);
      row.appendChild(cUSD);

      bodyEl.appendChild(row);
    }
  }

  function boot(root, core){
    if (!root) return;

    const st = {
      page: 0,
      rows: [],
      source: "",
      spotUsd: NaN,
      inflight: false,
      lastNetAt: 0,
      t: null,
      depsOk: false,
      sources: null,
    };

    const prev = root.querySelector("[data-mr-prev]");
    const next = root.querySelector("[data-mr-next]");
    const refreshBtn = root.querySelector("[data-mr-refresh]");

    if (prev && prev.dataset.zzxBound !== "1"){
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => { st.page = Math.max(0, (st.page||0)-1); render(root, st); });
    }
    if (next && next.dataset.zzxBound !== "1"){
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => { st.page = (st.page||0)+1; render(root, st); });
    }
    if (refreshBtn && refreshBtn.dataset.zzxBound !== "1"){
      refreshBtn.dataset.zzxBound = "1";
      refreshBtn.addEventListener("click", () => { st.lastNetAt = 0; });
    }

    const tick = async () => {
      if (!root.isConnected) return;
      if (st.inflight) return;

      if (!st.depsOk){
        st.inflight = true;
        try{
          const deps = await ensureDeps();
          if (!deps.ok){
            const subEl = root.querySelector("[data-mr-sub]");
            if (subEl) subEl.textContent = `error: ${deps.why}`;
            return;
          }
          st.depsOk = true;
          st.sources = W.ZZXMiningRewardSources.list();
        } finally {
          st.inflight = false;
        }
      }

      const now = Date.now();
      if ((now - st.lastNetAt) < NET_MIN_MS) return;

      st.inflight = true;
      try{
        const sumEl = root.querySelector("[data-mr-summary]");
        if (sumEl) sumEl.textContent = "loading…";

        const src = st.sources || W.ZZXMiningRewardSources.list();
        const spotUrl = src?.spot?.url;
        const poolCandidates = src?.pools24h || [];

        const [spot, pools] = await Promise.all([
          W.ZZXMiningRewardsFetch.fetchSpotUSD(core, spotUrl),
          W.ZZXMiningRewardsFetch.fetchPools24h(core, poolCandidates),
        ]);

        st.spotUsd = spot;
        st.rows = pools.rows || [];
        st.source = pools.source || "";
        st.lastNetAt = Date.now();

        render(root, st);
      } catch (e) {
        const subEl = root.querySelector("[data-mr-sub]");
        if (subEl) subEl.textContent = `error: ${String(e?.message || e)}`;
        if (DEBUG) console.warn("[mining-rewards] fetch failed", e);
        st.lastNetAt = Date.now(); // back off
      } finally {
        st.inflight = false;
      }
    };

    // clear any prior timer on reinjection
    if (root.__zzxMrTimer) clearInterval(root.__zzxMrTimer);
    root.__zzxMrTimer = setInterval(tick, UI_TICK_MS);
    tick();
  }

  // Core lifecycle
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
    return;
  }

  // Legacy shim
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, core) { boot(root, core); });
  }
})();
