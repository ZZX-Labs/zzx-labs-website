// __partials/widgets/hashrate/widget.js
// DROP-IN REPLACEMENT (FIX: unwrap wrapper AND parse nested JSON strings)
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

  // ---- CRITICAL: unwrap proxy/cached wrappers AND parse nested JSON strings ----
  function looksLikeJSON(s){
    const t = String(s ?? "").trim();
    return t.startsWith("{") || t.startsWith("[");
  }

  function tryParseJSON(s){
    try { return JSON.parse(String(s)); } catch { return null; }
  }

  function materialize(payload){
    // Goal: reach the real mempool payload (array or object), not wrapper shells.
    let cur = payload;

    for (let i=0; i<10; i++){
      // If we got a JSON string, parse it.
      if (typeof cur === "string" && looksLikeJSON(cur)) {
        const parsed = tryParseJSON(cur);
        if (parsed != null) { cur = parsed; continue; }
      }

      // If it’s the common wrapper shape: {data, source, stale, cachedAt}
      if (cur && typeof cur === "object" && ("data" in cur)) {
        const next = cur.data;

        // If wrapper.data is a JSON string, parse it then keep unwrapping.
        if (typeof next === "string" && looksLikeJSON(next)) {
          const parsed = tryParseJSON(next);
          if (parsed != null) { cur = parsed; continue; }
        }

        // Otherwise just unwrap into .data
        if (next === cur) break;
        cur = next;
        continue;
      }

      break;
    }

    // One last attempt: some systems put JSON in {body:"..."} or {text:"..."}
    if (cur && typeof cur === "object") {
      for (const k of ["body","text","raw","payload"]) {
        if (typeof cur[k] === "string" && looksLikeJSON(cur[k])) {
          const parsed = tryParseJSON(cur[k]);
          if (parsed != null) return parsed;
        }
      }
    }

    return cur;
  }

  function pickArray(payload){
    const p = materialize(payload);

    if (Array.isArray(p)) return p;

    if (p && typeof p === "object"){
      if (Array.isArray(p.hashrates)) return p.hashrates;
      if (Array.isArray(p.data)) return p.data;
      if (Array.isArray(p.series)) return p.series;
      if (Array.isArray(p.results)) return p.results;
      if (Array.isArray(p.items)) return p.items;
    }

    return null;
  }

  function normalizeSeries(payload){
    const arr = pickArray(payload);
    if (!arr) return [];

    const out = [];
    for (const pt of arr){
      if (pt == null) continue;

      // mempool often returns [ts, hashrate]
      if (Array.isArray(pt)){
        const t = n(pt[0]);
        const hs = n(pt[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof pt === "object"){
        const t = n(pt.timestamp ?? pt.time ?? pt.t);
        const hs = n(
          pt.hashrate ??
          pt.avgHashrate ??
          pt.avg_hashrate ??
          pt.value ??
          pt.v ??
          pt.h
        );
        if (Number.isFinite(hs)) out.push({ t, hs });
      }
    }

    for (const p of out){
      if (Number.isFinite(p.t) && p.t > 0 && p.t < 2e12) p.t *= 1000; // sec -> ms
    }

    out.sort((a,b)=> (a.t||0) - (b.t||0));
    return out;
  }

  function readDifficulty(payload){
    const p = materialize(payload);

    const cands = [
      p?.difficulty,
      p?.currentDifficulty,
      p?.current_difficulty,
      p?.block?.difficulty,
      p?.data?.difficulty,
      p?.result?.difficulty,
    ];
    for (const c of cands){
      const v = n(c);
      if (Number.isFinite(v) && v > 0) return v;
    }

    // sometimes difficulty is the numeric payload itself
    const self = n(p);
    if (Number.isFinite(self) && self > 0) return self;

    return NaN;
  }

  function getJPerTH(){
    const v = n(W.ZZX_MINING?.J_PER_TH);
    return (Number.isFinite(v) && v > 0) ? v : 30;
  }

  function inferTorFraction(){
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

  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  async function fetchTipDifficulty(core){
    const tipHashPayload = await W.ZZXHashrateFetch.fetchJSON(core, `${MEMPOOL}/api/blocks/tip/hash`);
    const tipHashMat = materialize(tipHashPayload);
    const tipHash = (typeof tipHashMat === "string") ? tipHashMat.trim() : "";

    if (!tipHash || tipHash.length < 16) return NaN;

    const blockPayload = await W.ZZXHashrateFetch.fetchJSON(core, `${MEMPOOL}/api/block/${encodeURIComponent(tipHash)}`);
    return readDifficulty(blockPayload);
  }

  async function update(root, core){
    if (!root || inflight) return;
    inflight = true;

    try{
      const deps = await ensureDeps();
      if (!deps.ok){
        setText(root, "[data-hr-sub]", `error: ${deps.why}`);
        return;
      }

      const src = W.ZZXHashrateSources.list()?.[0];
      if (!src?.endpoints?.hashrate3d){
        setText(root, "[data-hr-sub]", "error: no sources");
        return;
      }

      const jPerTH = getJPerTH();
      setText(root, "[data-hr-eff]", fmtInt(jPerTH));

      // series
      const seriesPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.hashrate3d);
      const points = normalizeSeries(seriesPayload);

      if (!points.length){
        const mat = materialize(seriesPayload);
        const hint = (mat && typeof mat === "object")
          ? `keys=${Object.keys(mat).slice(0,12).join(",")}`
          : `type=${typeof mat}`;
        throw new Error(`hashrate series empty (${hint})`);
      }

      const latest = points[points.length - 1];
      const zhNow = hsToZH(latest.hs);

      // publish for other widgets
      W.ZZXMiningStats = W.ZZXMiningStats || {};
      if (Number.isFinite(zhNow)) W.ZZXMiningStats.globalHashrateZH = zhNow;

      setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

      // sparkline (last 24 points)
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

      // difficulty
      let diff = NaN;

      if (src.endpoints?.difficulty){
        const diffPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.difficulty);
        diff = readDifficulty(diffPayload);
      }
      if (!(diff > 0)){
        diff = await fetchTipDifficulty(core);
      }

      setText(root, "[data-hr-diff]", (diff > 0) ? fmtInt(diff) : "—");

      // tor estimate
      let torFrac = inferTorFraction();
      if (Number.isFinite(torFrac)){
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

    if (root.__zzxHashrateTimer){
      clearInterval(root.__zzxHashrateTimer);
      root.__zzxHashrateTimer = null;
    }

    update(root, core);

    // slight jitter helps reduce “thundering herd” vs proxies
    const base = 60_000;
    const jitter = Math.floor(Math.random() * 7000);
    root.__zzxHashrateTimer = setInterval(() => update(root, core), base + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
  } else if (W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID, (root, core) => boot(root, core));
  } else {
    if (DEBUG) console.warn("[hashrate] no widget registry found");
  }
})();
