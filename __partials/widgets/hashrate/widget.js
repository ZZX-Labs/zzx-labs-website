// __partials/widgets/hashrate/widget.js
// DROP-IN REPLACEMENT
// - Auto-loads sources.js + fetch.js from same widget dir
// - Uses robust text-first JSON parsing w/ direct→AllOrigins fallback
// - Keeps your DOM contract intact

(function () {
  "use strict";

  const W = window;
  const ID = "hashrate";

  const DEFAULT_J_PER_TH = 30;
  let inflight = false;

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  function fmtNum(n, digits = 2) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "—";
  }
  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }
  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function getJPerTH() {
    const v = W.ZZX_MINING && Number(W.ZZX_MINING.J_PER_TH);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_J_PER_TH;
  }

  function hsToZH(hs) {
    const n = n2(hs);
    return Number.isFinite(n) ? (n / 1e21) : NaN;
  }

  function buildSpark(valuesZH) {
    const w = 300, h = 70, pad = 6;
    const vals = valuesZH.filter(Number.isFinite);
    if (!vals.length) return { line: "", area: "" };

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = (max - min) || 1;

    const n = valuesZH.length;
    const pts = valuesZH.map((v, i) => {
      const x = (i / Math.max(1, n - 1)) * (w - pad * 2) + pad;
      const vv = Number.isFinite(v) ? v : min;
      const y = (h - pad) - ((vv - min) / span) * (h - pad * 2);
      return [x, y];
    });

    const line = "M " + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
    const area = [line, `L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)}`, `L ${pad.toFixed(2)} ${(h - pad).toFixed(2)}`, "Z"].join(" ");
    return { line, area };
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function widgetBasePath(){
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/hashrate/";
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

    if (!W.ZZXHashrateSources?.list){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:hashrate:sources");
      if (!ok) return { ok:false, why:"sources.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashrateSources?.list) return { ok:false, why:"sources.js did not register" };
    }

    if (!W.ZZXHashrateFetch?.fetchJSON){
      const ok = await loadScriptOnce(base+"fetch.js", "zzx:hashrate:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashrateFetch?.fetchJSON) return { ok:false, why:"fetch.js did not register" };
    }

    return { ok:true };
  }

  function normalizeSeries(payload) {
    let arr = payload;

    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      if (Array.isArray(payload.hashrates)) arr = payload.hashrates;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.series)) arr = payload.series;
    }
    if (!Array.isArray(arr)) return [];

    const out = [];
    for (const p of arr) {
      if (!p) continue;

      if (Array.isArray(p)) {
        const t = n2(p[0]);
        const hs = n2(p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof p === "object") {
        const t = n2(p.timestamp ?? p.time ?? p.t);
        const hs = n2(p.hashrate ?? p.avgHashrate ?? p.value ?? p.v ?? p.h);
        if (Number.isFinite(hs)) out.push({ t, hs });
      }
    }

    // seconds -> ms
    for (const pt of out) {
      if (Number.isFinite(pt.t) && pt.t < 2e12) pt.t = pt.t * 1000;
    }

    out.sort((a,b)=> (a.t||0) - (b.t||0));
    return out;
  }

  function normalizeDifficulty(payload) {
    return (
      n2(payload?.difficulty) ||
      n2(payload?.currentDifficulty) ||
      n2(payload?.current_difficulty) ||
      n2(payload?.previousRetarget) ||
      n2(payload?.previous_retarget) ||
      NaN
    );
  }

  async function update(root, core) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-hr-sub]", `error: ${deps.why}`);
        return;
      }

      const src = (W.ZZXHashrateSources.list()?.[0]) || null;
      if (!src) {
        setText(root, "[data-hr-sub]", "error: no sources");
        return;
      }

      const jPerTH = getJPerTH();
      setText(root, "[data-hr-eff]", fmtInt(jPerTH));

      // fetch hashrate series + difficulty via robust fetch
      const seriesPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.hashrate3d);
      const points = normalizeSeries(seriesPayload);
      if (!points.length) throw new Error("hashrate series empty");

      const latest = points[points.length - 1];
      const zhNow = hsToZH(latest.hs);
      setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

      const last24 = points.slice(Math.max(0, points.length - 24));
      const last24ZH = last24.map(p => hsToZH(p.hs));

      const svg = root.querySelector("[data-hr-svg]");
      if (svg) {
        const { line, area } = buildSpark(last24ZH);
        const pLine = svg.querySelector("[data-hr-line]");
        const pArea = svg.querySelector("[data-hr-area]");
        if (pLine) pLine.setAttribute("d", line);
        if (pArea) pArea.setAttribute("d", area);
      }

      // Power estimate
      const watts = zhNow * 1e9 * jPerTH;  // ZH/s -> TH/s (×1e9) then ×J/TH => W
      const gw = watts / 1e9;

      const gwh1 = gw;
      const finite24 = last24ZH.filter(Number.isFinite);
      const avgZH24 = finite24.reduce((a,b)=>a+b,0) / Math.max(1, finite24.length);
      const gwAvg24 = (avgZH24 * 1e9 * jPerTH) / 1e9;
      const gwh24 = gwAvg24 * 24;

      setText(root, "[data-hr-power]", Number.isFinite(gw) ? `${fmtNum(gw, 2)} GW` : "—");
      setText(root, "[data-hr-e1]", Number.isFinite(gwh1) ? `${fmtNum(gwh1, 2)} GWh` : "—");
      setText(root, "[data-hr-e24]", Number.isFinite(gwh24) ? `${fmtNum(gwh24, 1)} GWh` : "—");

      const diffPayload = await W.ZZXHashrateFetch.fetchJSON(core, src.endpoints.difficulty);
      const dNow = normalizeDifficulty(diffPayload);
      setText(root, "[data-hr-diff]", Number.isFinite(dNow) ? fmtInt(dNow) : "—");

      setText(root, "[data-hr-tor]", "—");
      setText(root, "[data-hr-tor-note]", "no public feed");

      setText(root, "[data-hr-sub]", `Source: ${src.label} (hashrate 3d + difficulty-adjustment)`);
    } catch (e) {
      const msg = String(e?.message || e);
      setText(root, "[data-hr-sub]", `error: ${msg}`);
      if (DEBUG) console.warn("[hashrate]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxHashrateTimer) {
      clearInterval(root.__zzxHashrateTimer);
      root.__zzxHashrateTimer = null;
    }

    update(root, core);
    root.__zzxHashrateTimer = setInterval(() => update(root, core), 60_000);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, core) { boot(root, core); });
  }
})();
