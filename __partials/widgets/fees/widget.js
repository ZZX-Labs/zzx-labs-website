// __partials/widgets/fees/widget.js
// DROP-IN (manifest/core compatible)
// - Auto-loads sources.js, fetch.js, estimator.js from same folder
// - direct -> allorigins -> stale cache fallback (fixes 429 + AO outage)
// - Preserves your existing DOM contract (data-fees-*)

(function () {
  "use strict";

  const W = window;
  const ID = "fees";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function widgetBasePath(){
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/fees/";
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

    if (!W.ZZXFeesSources?.endpoints?.recommended){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:fees:sources");
      if (!ok) return { ok:false, why:"sources.js missing (ZZXFeesSources)" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXFeesSources?.endpoints?.recommended) return { ok:false, why:"sources.js did not register" };
    }

    if (!W.ZZXFeesFetch?.fetchJSON){
      const ok = await loadScriptOnce(base+"fetch.js", "zzx:fees:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing (ZZXFeesFetch)" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXFeesFetch?.fetchJSON) return { ok:false, why:"fetch.js did not register" };
    }

    if (!W.ZZXFeesEstimator?.build){
      const ok = await loadScriptOnce(base+"estimator.js", "zzx:fees:estimator");
      if (!ok) return { ok:false, why:"estimator.js missing (ZZXFeesEstimator)" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXFeesEstimator?.build) return { ok:false, why:"estimator.js did not register" };
    }

    return { ok:true };
  }

  // ---------- Unit cycle ----------
  function getUnitId(root){
    const k = "zzx:fees:unit:v1";
    return root.__zzxFeesUnit || localStorage.getItem(k) || "sat";
  }

  function setUnitId(root, unitId){
    const k = "zzx:fees:unit:v1";
    root.__zzxFeesUnit = unitId;
    try { localStorage.setItem(k, unitId); } catch {}
  }

  function unitLabel(unitId){
    const u = W.ZZXFeesSources?.units?.find(x => x.id === unitId);
    return u?.label || "sat/vB";
  }

  function convertFromSatVB(sat, unitId){
    const v = Number(sat);
    if (!Number.isFinite(v)) return NaN;

    if (unitId === "sat") return v;
    if (unitId === "btc") return v * 1e-8;   // sat -> BTC
    if (unitId === "msat") return v * 1000;  // sat -> msat
    if (unitId === "usat") return v * 1e6;   // sat -> μsat
    return v;
  }

  function fmtUnit(v, unitId){
    if (!Number.isFinite(v)) return "—";
    if (unitId === "btc") return v.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
    if (unitId === "msat" || unitId === "usat") return Math.round(v).toLocaleString();
    return Math.round(v).toLocaleString();
  }

  function writeUnitText(root, label){
    // update every inline unit span
    const nodes = root.querySelectorAll(".zzx-fees-unit");
    nodes.forEach(n => n.textContent = " " + label);
    const btn = root.querySelector("[data-fees-unit]");
    if (btn) btn.textContent = label;
  }

  function bindUnit(root){
    const btn = root.querySelector("[data-fees-unit]");
    if (!btn || btn.dataset.zzxBound === "1") return;
    btn.dataset.zzxBound = "1";

    btn.addEventListener("click", () => {
      const units = W.ZZXFeesSources?.units || [
        { id:"sat", label:"sat/vB" }, { id:"btc", label:"BTC/vB" }, { id:"msat", label:"msat/vB" }, { id:"usat", label:"μsat/vB" }
      ];
      const cur = getUnitId(root);
      const idx = Math.max(0, units.findIndex(u => u.id === cur));
      const next = units[(idx + 1) % units.length].id;
      setUnitId(root, next);
      writeUnitText(root, unitLabel(next));
      // re-render from cached model if present
      renderFromModel(root);
    });
  }

  // ---------- Render ----------
  function renderFromModel(root){
    const model = root.__zzxFeesModel;
    if (!model) return;

    const unitId = getUnitId(root);
    const label = unitLabel(unitId);
    writeUnitText(root, label);

    // Avg fee main output uses data-fees-fast selector by legacy contract
    const avgInUnit = convertFromSatVB(model.avg, unitId);
    setText(root, "[data-fees-fast]", fmtUnit(avgInUnit, unitId)); // keep selector

    // Instant/Fast/Low in subline already reuse existing selectors for fast/30m/1h
    const t = model.tiers;

    // fill legacy known values
    setText(root, "[data-fees-30m]", fmtUnit(convertFromSatVB(t.fast, unitId), unitId));
    setText(root, "[data-fees-1h]",  fmtUnit(convertFromSatVB(t.low, unitId), unitId));
    setText(root, "[data-fees-econ]",fmtUnit(convertFromSatVB(t.economy, unitId), unitId));
    setText(root, "[data-fees-min]", fmtUnit(convertFromSatVB(t.min, unitId), unitId));

    // fill extended tiers
    setText(root, "[data-fees-instant]", fmtUnit(convertFromSatVB(t.instant, unitId), unitId));
    setText(root, "[data-fees-high]",    fmtUnit(convertFromSatVB(t.high, unitId), unitId));
    setText(root, "[data-fees-mid]",     fmtUnit(convertFromSatVB(t.mid, unitId), unitId));

    // ranges always displayed in sat/vB terms (stable interpretability)
    function fmtRange(r){
      if (!r || !Number.isFinite(r.lo) || !Number.isFinite(r.hi)) return "—";
      return `${Math.round(r.lo).toLocaleString()}–${Math.round(r.hi).toLocaleString()} sat/vB`;
    }

    setText(root, "[data-fees-instant-r]", fmtRange(model.ranges.instant));
    setText(root, "[data-fees-fast-r]",    fmtRange(model.ranges.fast));
    setText(root, "[data-fees-high-r]",    fmtRange(model.ranges.high));
    setText(root, "[data-fees-mid-r]",     fmtRange(model.ranges.mid));
    setText(root, "[data-fees-low-r]",     fmtRange(model.ranges.low));
    setText(root, "[data-fees-econ-r]",    fmtRange(model.ranges.economy));
    setText(root, "[data-fees-min-r]",     fmtRange(model.ranges.min));
  }

  async function refresh(root){
    if (!root || inflight) return;
    inflight = true;

    try{
      const deps = await ensureDeps();
      if (!deps.ok){
        setText(root, "[data-fees-status]", "error: " + deps.why);
        return;
      }

      setText(root, "[data-fees-status]", "loading…");

      const url = W.ZZXFeesSources.endpoints.recommended;
      const pol = W.ZZXFeesSources.policy || {};
      const res = await W.ZZXFeesFetch.fetchJSON({
        url,
        cacheKey: "zzx:fees:recommended:v1",
        ttlMs: pol.cacheTtlMs,
        timeoutMs: pol.timeoutMs
      });

      const built = W.ZZXFeesEstimator.build(res.data || {});
      root.__zzxFeesModel = built;

      renderFromModel(root);

      const stale = res.stale ? " (stale cache)" : "";
      setText(root, "[data-fees-status]", `mempool.space (${res.source}${stale})`);
    }catch(e){
      setText(root, "[data-fees-status]", "error: " + String(e?.message || e));
      if (DEBUG) console.warn("[fees]", e);
    }finally{
      inflight = false;
    }
  }

  function wire(root){
    const btn = root.querySelector("[data-fees-refresh]");
    if (btn && btn.dataset.zzxBound !== "1") {
      btn.dataset.zzxBound = "1";
      btn.addEventListener("click", () => refresh(root));
    }
    bindUnit(root);
  }

  function boot(root){
    if (!root) return;

    if (root.__zzxFeesTimer){
      clearInterval(root.__zzxFeesTimer);
      root.__zzxFeesTimer = null;
    }

    wire(root);
    refresh(root);

    // jitter to avoid synchronized stampede across many widgets
    const base = Number(W.ZZXFeesSources?.policy?.refreshMs) || 60_000;
    const jitter = Math.floor(Math.random() * 9000);
    root.__zzxFeesTimer = setInterval(()=>refresh(root), base + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }
  if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, (root) => boot(root));
  }
})();
