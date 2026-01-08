// __partials/widgets/hashrate/widget.js
// DROP-IN REPLACEMENT (FIXED CONTRACT: fetchJSON returns payload directly)
// Fixes:
// - "hashrate series empty" caused by expecting {data:...}
// - Difficulty: — by falling back to tip block difficulty
//
// Requires existing files already in your widget dir:
//   sources.js  (ZZXHashrateSources.list())
//   fetch.js    (ZZXHashrateFetch.fetchJSON(core?, url))
//   plotter.js  (ZZXHashratePlotter.build(values))
//   chart.js    (ZZXHashrateChart.draw(svg, values))

(function () {
  "use strict";

  const W = window;
  const ID = "hashrate";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const MEMPOOL = "https://mempool.space";

  let inflight = false;

  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
  function hsToZH(hs){ const v = n(hs); return Number.isFinite(v) ? (v / 1e21) : NaN; }

  function fmtNum(x, d=2){
    return Number.isFinite(x)
      ? x.toLocaleString(undefined, { minimumFractionDigits:d, maximumFractionDigits:d })
      : "—";
  }
  function fmtInt(x){ return Number.isFinite(x) ? Math.round(x).toLocaleString() : "—"; }

  function setText(root, sel, text){
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function widgetBasePath(){
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/hashrate/";
  }

  async function loadOnce(url, key){
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

    const deps = [
      ["sources.js", "zzx:hashrate:sources", ()=>W.ZZXHashrateSources?.list],
      ["fetch.js",   "zzx:hashrate:fetch",   ()=>W.ZZXHashrateFetch?.fetchJSON],
      ["plotter.js", "zzx:hashrate:plotter", ()=>W.ZZXHashratePlotter?.build],
      ["chart.js",   "zzx:hashrate:chart",   ()=>W.ZZXHashrateChart?.draw],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok:false, why:`${file} missing` };
      await new Promise(r=>setTimeout(r,0));
      if (!okfn()) return { ok:false, why:`${file} did not register` };
    }
    return { ok:true };
  }

  // ---- series parsing (mempool hashrate/3d is usually [[ts,hs], ...] OR {hashrates:[...]} ) ----
  function pickArray(payload){
    if (Array.isArray(payload)) return payload;

    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.hashrates)) return payload.hashrates;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.series)) return payload.series;

      // sometimes a nested object shows up from proxies
      if (payload.result && Array.isArray(payload.result)) return payload.result;
      if (payload.results && Array.isArray(payload.results)) return payload.results;
    }

    return null;
  }

  function normalizeSeries(payload){
    const arr = pickArray(payload);
    if (!arr) return [];

    const out = [];
    for (const p of arr) {
      if (p == null) continue;

      if (Array.isArray(p)) {
        const t = n(p[0]);
        const hs = n(p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof p === "object") {
        const t = n(p.timestamp ?? p.time ?? p.t);
        const hs = n(
          p.hashrate ??
          p.avgHashrate ??
          p.avg_hashrate ??
          p.value ??
          p.v ??
          p.h
        );
        if (Number.isFinite(hs)) out.push({ t, hs });
      }
    }

    // seconds -> ms
    for (const pt of out) {
      if (Number.isFinite(pt.t) && pt.t > 0 && pt.t < 2e12) pt.t = pt.t * 1000;
    }

    out.sort((a,b)=> (a.t||0) - (b.t||0));
    return out;
  }

  // ---- difficulty parsing (absolute difficulty may appear in block payload) ----
  function readDifficulty(payload){
    const cands = [
      payload?.difficulty,
      payload?.currentDifficulty,
      payload?.current_difficulty,
      payload?.data?.difficulty, // if some proxy wraps
      payload?.block?.difficulty,
    ];
    for (const c of cands) {
      const v = n(c);
      if (Number.isFinite(v) && v > 0) return v;
    }
    const self = n(payload);
    if (Number.isFinite(self) && self > 0) return self;
    return NaN;
  }

  // ---- energy model ----
  function getJPerTH(){
    const v = n(W.ZZX_MINING?.J_PER_TH);
    return (Number.isFinite(v) && v > 0) ? v : 30;
  }

  // ---- optional tor fraction inference ----
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  function inferTorFraction(){
    // you may expose any of these in your node widgets
    const total = [
      W.ZZXNodesTotals?.total,
      W.ZZXNodes?.total,
      W.ZZXNodesByNation?.totalNodes,
    ].map(n).find(v => Number.isFinite(v) && v > 0);

    const tor = [
      W.ZZXNodesTotals?.tor,
      W.ZZXNodes?.tor,
      W.ZZXNodesByNation?.torTotal,
    ].map(n).find(v => Number.isFinite(v) && v > 0);

    if (Number.isFinite(total) && Number.isFinite(tor) && total > 0) return tor / total;

    const f = n(W.ZZXNodesTotals?.torFraction);
    if (Number.isFinite(f) && f > 0) return f;

    return NaN;
  }

  async function fetchTipDifficulty(core){
    // tip hash is plain string from mempool
    const tipHashPayload = await W.ZZXHashrateFetch.fetchJSON(core, `${MEMPOOL}/api/blocks/tip/hash`);
    const tipHash = (typeof tipHashPayload === "string")
      ? tipHashPayload.trim()
      : (typeof tipHashPayload?.data === "string" ? tipHashPayload.data.trim() : "");

    if (!tipHash || tipHash.length < 16) return NaN;

    const blockPayload = await W.ZZXHashrateFetch.fetchJSON(core, `${MEMPOOL}/api/block/${encodeURIComponent(tipHash)}`);
    return readDifficulty(blockPayload);
  }

  async function update(root, core){
    if (!root || inflight) return;
    inflight = true;

    try{
      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-hr-sub]", `error: ${deps.why}`);
        return;
      }

      const src = W.ZZXHashrateSources.list()?.[0];
      if (!src?.endpoints?.hashrate3d) {
        setText(root, "[data-hr-sub]", "error: no sources");
        return;
      }

      const jPerTH = getJPerTH();
      setText(root, "[data-hr-eff]", fmtInt(jPerTH));

      // ---- series ----
      const seriesPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.hashrate3d);
      const points = normalizeSeries(seriesPayload);

      if (!points.length) {
        // show a real debug hint without dumping huge objects
        const hint = (seriesPayload && typeof seriesPayload === "object")
          ? `keys=${Object.keys(seriesPayload).slice(0,8).join(",")}`
          : `type=${typeof seriesPayload}`;
        throw new Error(`hashrate series empty (${hint})`);
      }

      const latest = points[points.length - 1];
      const zhNow = hsToZH(latest.hs);

      // publish for other widgets (your nation estimator uses this)
      W.ZZXMiningStats = W.ZZXMiningStats || {};
      if (Number.isFinite(zhNow)) W.ZZXMiningStats.globalHashrateZH = zhNow;

      setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

      // chart: last ~24 points
      const tail = points.slice(Math.max(0, points.length - 24));
      const valsZH = tail.map(p => hsToZH(p.hs));
      const svg = root.querySelector("[data-hr-svg]");
      if (svg) W.ZZXHashrateChart.draw(svg, valsZH);

      // power/energy estimates
      const gwNow = (zhNow * 1e9 * jPerTH) / 1e9;
      const finite = valsZH.filter(Number.isFinite);
      const avgZH = finite.reduce((a,b)=>a+b,0) / Math.max(1, finite.length);
      const gwAvg = (avgZH * 1e9 * jPerTH) / 1e9;

      setText(root, "[data-hr-power]", Number.isFinite(gwNow) ? `${fmtNum(gwNow, 2)} GW` : "—");
      setText(root, "[data-hr-e1]", Number.isFinite(gwNow) ? `${fmtNum(gwNow, 2)} GWh` : "—");
      setText(root, "[data-hr-e24]", Number.isFinite(gwAvg) ? `${fmtNum(gwAvg * 24, 1)} GWh` : "—");

      // ---- difficulty ----
      let diff = NaN;

      // 1) try your configured difficulty endpoint if present
      if (src.endpoints?.difficulty) {
        const diffPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.difficulty);
        diff = readDifficulty(diffPayload);
      }

      // 2) fallback: read difficulty from tip block (reliable)
      if (!(diff > 0)) {
        diff = await fetchTipDifficulty(core);
      }

      setText(root, "[data-hr-diff]", (diff > 0) ? fmtInt(diff) : "—");

      // ---- tor estimate ----
      let torFrac = inferTorFraction();
      if (Number.isFinite(torFrac)) {
        torFrac = clamp(torFrac, 0.05, 0.85);
        const torZH = zhNow * torFrac;
        const low = zhNow * clamp(torFrac * 0.70, 0.05, 0.85);
        const high = zhNow * clamp(torFrac * 1.30, 0.05, 0.85);

        setText(root, "[data-hr-tor]", `${fmtNum(torZH, 2)} ZH/s`);
        setText(root, "[data-hr-tor-note]", `${fmtNum(low, 2)}–${fmtNum(high, 2)} ZH/s · ${fmtNum(torFrac*100, 1)}% inferred`);
      } else {
        setText(root, "[data-hr-tor]", "—");
        setText(root, "[data-hr-tor-note]", "no tor node signal");
      }

      setText(root, "[data-hr-sub]", `Source: ${src.label || "mempool.space"}`);

    } catch(e){
      const msg = String(e?.message || e);
      setText(root, "[data-hr-sub]", `error: ${msg}`);
      if (DEBUG) console.warn("[hashrate]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root, core){
    if (!root) return;

    if (root.__zzxHashrateTimer) {
      clearInterval(root.__zzxHashrateTimer);
      root.__zzxHashrateTimer = null;
    }

    update(root, core);

    // jitter reduces rate-limit collisions when many widgets update simultaneously
    const base = 60_000;
    const jitter = Math.floor(Math.random() * 7000);
    root.__zzxHashrateTimer = setInterval(() => update(root, core), base + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
  } else if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, (root, core) => boot(root, core));
  } else {
    if (DEBUG) console.warn("[hashrate] no widget registry found");
  }
})();
