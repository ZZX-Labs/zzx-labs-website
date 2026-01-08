// __partials/widgets/hashrate/widget.js
// DROP-IN REPLACEMENT (fixes: "hashrate series empty" by accepting mempool payload shapes)
// Requires separate files present:
//   sources.js, fetch.js, plotter.js, chart.js

(function () {
  "use strict";

  const W = window;
  const ID = "hashrate";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
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

  function hsToZH(hs){
    const v = n(hs);
    return Number.isFinite(v) ? (v / 1e21) : NaN;
  }

  // ---- robust: accept mempool shapes ----
  function pickArray(payload){
    // Most common:
    // 1) payload is already an array
    if (Array.isArray(payload)) return payload;

    // 2) payload.hashrates is an array
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.hashrates)) return payload.hashrates;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.series)) return payload.series;

      // Some proxies wrap:
      // { data: { hashrates: [...] } } or { hashrates: { hashrates:[...] } }
      if (payload.data && typeof payload.data === "object") {
        if (Array.isArray(payload.data.hashrates)) return payload.data.hashrates;
        if (Array.isArray(payload.data.data)) return payload.data.data;
        if (Array.isArray(payload.data.series)) return payload.data.series;
      }
      if (payload.hashrates && typeof payload.hashrates === "object") {
        if (Array.isArray(payload.hashrates.hashrates)) return payload.hashrates.hashrates;
        if (Array.isArray(payload.hashrates.data)) return payload.hashrates.data;
        if (Array.isArray(payload.hashrates.series)) return payload.hashrates.series;
      }
    }
    return null;
  }

  function normalizeSeries(payload){
    const arr = pickArray(payload);
    if (!arr) return [];

    const out = [];
    for (const p of arr) {
      if (p == null) continue;

      // mempool sometimes returns [timestamp, avgHashrate]
      if (Array.isArray(p)) {
        const t = n(p[0]);
        const hs = n(p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof p === "object") {
        // mempool object form: { timestamp, avgHashrate, height }
        const t = n(p.timestamp ?? p.time ?? p.t);
        const hs = n(
          p.avgHashrate ??
          p.avg_hashrate ??
          p.hashrate ??
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

  function normalizeDifficulty(payload){
    const candidates = [
      payload?.difficulty,
      payload?.currentDifficulty,
      payload?.current_difficulty,
      payload?.newDifficulty,
      payload?.new_difficulty,
      payload?.data?.difficulty,
      payload?.data?.currentDifficulty,
      payload?.data?.current_difficulty,
    ];
    for (const c of candidates) {
      const v = n(c);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return NaN;
  }

  function getJPerTH(){
    const v = n(W.ZZX_MINING?.J_PER_TH);
    const d = n(W.ZZXHashrateSources?.defaults?.jPerTH);
    return (Number.isFinite(v) && v > 0) ? v : ((Number.isFinite(d) && d > 0) ? d : 30);
  }

  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  function inferTorFraction(){
    const total = [
      W.ZZXNodesTotals?.total,
      W.ZZXNodes?.total,
      W.ZZXTorStats?.totalNodes,
      W.ZZXNodesByNation?.totalNodes
    ].map(n).find(v => Number.isFinite(v) && v > 0);

    const tor = [
      W.ZZXNodesTotals?.tor,
      W.ZZXNodes?.tor,
      W.ZZXTorStats?.torNodes,
      W.ZZXNodesByNation?.torTotal
    ].map(n).find(v => Number.isFinite(v) && v > 0);

    if (Number.isFinite(total) && Number.isFinite(tor) && total > 0) return tor / total;

    const f = n(W.ZZXTorStats?.torFraction ?? W.ZZXNodesTotals?.torFraction);
    if (Number.isFinite(f) && f > 0) return f;

    return NaN;
  }

  function previewPayload(x){
    try{
      const s = JSON.stringify(x);
      if (!s) return "null";
      return s.length > 220 ? s.slice(0,220) + "…" : s;
    }catch{
      return String(x);
    }
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
      if (!src) {
        setText(root, "[data-hr-sub]", "error: sources empty");
        return;
      }

      const jPerTH = getJPerTH();
      setText(root, "[data-hr-eff]", fmtInt(jPerTH));

      const pol = W.ZZXHashrateSources.policy || {};
      const ttlMs = pol.cacheTtlMs || 300000;
      const timeoutMs = pol.timeoutMs || 12000;

      // ---- series ----
      const seriesRes = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.hashrate3d, {
        cacheKey: "zzx:hashrate:series:v3",
        ttlMs, timeoutMs
      });

      const points = normalizeSeries(seriesRes.data);
      if (!points.length) {
        // Show preview so you can see what mempool/allorigins returned
        const pv = previewPayload(seriesRes.data);
        throw new Error(`hashrate series empty · payload=${pv}`);
      }

      const latest = points[points.length - 1];
      const zhNow = hsToZH(latest.hs);

      // publish global for other widgets
      W.ZZXMiningStats = W.ZZXMiningStats || {};
      if (Number.isFinite(zhNow)) W.ZZXMiningStats.globalHashrateZH = zhNow;

      setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

      // chart: last ~24 points (mempool 3d is hourly; 24 points = ~24h)
      const tail = points.slice(Math.max(0, points.length - 24));
      const valsZH = tail.map(p => hsToZH(p.hs));
      const svg = root.querySelector("[data-hr-svg]");
      if (svg) W.ZZXHashrateChart.draw(svg, valsZH);

      // power/energy
      const gwNow = (zhNow * 1e9 * jPerTH) / 1e9;
      const finite = valsZH.filter(Number.isFinite);
      const avgZH = finite.reduce((a,b)=>a+b,0) / Math.max(1, finite.length);
      const gwAvg = (avgZH * 1e9 * jPerTH) / 1e9;

      setText(root, "[data-hr-power]", Number.isFinite(gwNow) ? `${fmtNum(gwNow, 2)} GW` : "—");
      setText(root, "[data-hr-e1]", Number.isFinite(gwNow) ? `${fmtNum(gwNow, 2)} GWh` : "—");
      setText(root, "[data-hr-e24]", Number.isFinite(gwAvg) ? `${fmtNum(gwAvg * 24, 1)} GWh` : "—");

      // ---- difficulty ----
      const diffRes = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.difficulty, {
        cacheKey: "zzx:hashrate:diff:v3",
        ttlMs, timeoutMs
      });

      const diff = normalizeDifficulty(diffRes.data);
      setText(root, "[data-hr-diff]", Number.isFinite(diff) ? fmtInt(diff) : "—");

      // ---- tor estimate (only if you provide node totals) ----
      const torCfg = W.ZZXHashrateSources.tor || { clampMin:0.05, clampMax:0.85, bandLowMult:0.70, bandHighMult:1.30 };
      let torFrac = inferTorFraction();

      if (Number.isFinite(torFrac)) {
        torFrac = clamp(torFrac, torCfg.clampMin, torCfg.clampMax);
        const lowF = clamp(torFrac * torCfg.bandLowMult, torCfg.clampMin, torCfg.clampMax);
        const highF = clamp(torFrac * torCfg.bandHighMult, torCfg.clampMin, torCfg.clampMax);

        const torZH = zhNow * torFrac;
        const torLow = zhNow * lowF;
        const torHigh = zhNow * highF;

        setText(root, "[data-hr-tor]", `${fmtNum(torZH, 2)} ZH/s`);
        setText(root, "[data-hr-tor-note]", `${fmtNum(torLow, 2)}–${fmtNum(torHigh, 2)} ZH/s · ${fmtNum(torFrac*100, 1)}% inferred`);
      } else {
        setText(root, "[data-hr-tor]", "—");
        setText(root, "[data-hr-tor-note]", "no tor node signal");
      }

      const staleBits = [];
      if (seriesRes.stale) staleBits.push("hashrate stale");
      if (diffRes.stale) staleBits.push("difficulty stale");
      const staleNote = staleBits.length ? ` · (${staleBits.join(", ")})` : "";

      setText(root, "[data-hr-sub]", `Source: ${src.label}${staleNote}`);

    } catch(e){
      setText(root, "[data-hr-sub]", `error: ${String(e?.message || e)}`);
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

    const base = Number(W.ZZXHashrateSources?.policy?.refreshMs) || 60000;
    const jitter = Math.floor(Math.random() * 7000);
    root.__zzxHashrateTimer = setInterval(() => update(root, core), base + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
  } else if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, (root, core) => boot(root, core));
  }
})();
