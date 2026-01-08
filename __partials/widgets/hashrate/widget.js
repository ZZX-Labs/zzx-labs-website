// __partials/widgets/hashrate/widget.js
// DROP-IN REPLACEMENT
// - Ensures deps: sources.js, fetch.js, plotter.js, chart.js (auto-load from same dir)
// - Uses mempool.space via AllOrigins (through core.fetchJSON / ZZXAO fallback)
// - Renders: current ZH/s, difficulty, power + energy estimates, 24h spark (last 24 points)

(function () {
  "use strict";

  const W = window;
  const ID = "hashrate";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const UI_TICK_MS  = 750;
  const NET_MIN_MS  = 60_000;

  const DEFAULT_J_PER_TH = 30;

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function fmtNum(n, digits = 2) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "—";
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  // H/s -> ZH/s
  function hsToZH(hs) {
    const v = n2(hs);
    return Number.isFinite(v) ? (v / 1e21) : NaN;
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function getJPerTH() {
    const v = n2(W.ZZX_MINING && W.ZZX_MINING.J_PER_TH);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_J_PER_TH;
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

    if (!W.ZZXHashrateSources?.get){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:hashrate:sources");
      if (!ok) return { ok:false, why:"sources.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashrateSources?.get) return { ok:false, why:"sources.js did not register" };
    }

    if (!W.ZZXHashrateFetch?.fetchHashrateSeries){
      const ok = await loadScriptOnce(base+"fetch.js", "zzx:hashrate:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashrateFetch?.fetchHashrateSeries) return { ok:false, why:"fetch.js did not register" };
    }

    if (!W.ZZXHashratePlotter?.build){
      const ok = await loadScriptOnce(base+"plotter.js", "zzx:hashrate:plotter");
      if (!ok) return { ok:false, why:"plotter.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashratePlotter?.build) return { ok:false, why:"plotter.js did not register" };
    }

    if (!W.ZZXHashrateChart?.draw){
      const ok = await loadScriptOnce(base+"chart.js", "zzx:hashrate:chart");
      if (!ok) return { ok:false, why:"chart.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!W.ZZXHashrateChart?.draw) return { ok:false, why:"chart.js did not register" };
    }

    return { ok:true };
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl){
      this.root = slotEl;
      this._t = null;
      this._ctx = null;
      this._busy = false;
      this._lastNetAt = 0;
      this._depsOk = false;
      this._src = null;
      this._cache = { points: null, diff: NaN, when: 0 };
    },

    async start(ctx){
      this._ctx = ctx || null;
      const root = this.root;
      if (!root) return;

      const sub = root.querySelector("[data-hr-sub]");

      const deps = await ensureDeps();
      if (!deps.ok){
        if (sub) sub.textContent = `error: ${deps.why}`;
        return;
      }

      this._depsOk = true;
      this._src = W.ZZXHashrateSources.get();

      const tick = async () => {
        if (!root.isConnected) return;
        if (this._busy) return;

        const now = Date.now();
        if ((now - this._lastNetAt) < NET_MIN_MS) return;

        this._busy = true;
        try{
          const jPerTH = getJPerTH();
          setText(root, "[data-hr-eff]", fmtInt(jPerTH));

          const src = this._src || W.ZZXHashrateSources.get();

          if (sub) sub.textContent = "loading…";

          const [points, diff] = await Promise.all([
            W.ZZXHashrateFetch.fetchHashrateSeries(this._ctx, src.hashrate3d),
            W.ZZXHashrateFetch.fetchDifficulty(this._ctx, src.difficultyAdj),
          ]);

          this._cache.points = points;
          this._cache.diff = diff;
          this._cache.when = Date.now();

          // latest ZH/s
          const latest = points[points.length - 1];
          const zhNow = hsToZH(latest.hs);
          setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

          // difficulty
          setText(root, "[data-hr-diff]", Number.isFinite(diff) ? fmtInt(diff) : "—");

          // last ~24 points for 24h spark (hourly-ish series)
          const last24 = points.slice(Math.max(0, points.length - 24));
          const last24ZH = last24.map(p => hsToZH(p.hs));

          const svg = root.querySelector("[data-hr-svg]");
          try{
            W.ZZXHashrateChart.draw(svg, last24ZH);
          }catch(e){
            if (DEBUG) console.warn("[hashrate] chart draw failed", e);
          }

          // power + energy estimates
          // TH/s = ZH/s * 1e9
          // W = TH/s * J/TH
          const watts = zhNow * 1e9 * jPerTH;
          const gw = watts / 1e9;

          const gwh1 = gw; // GW * 1h = GWh

          const finite24 = last24ZH.filter(Number.isFinite);
          const avgZH24 = finite24.reduce((a,b)=>a+b,0) / Math.max(1, finite24.length);
          const gwAvg24 = (avgZH24 * 1e9 * jPerTH) / 1e9;
          const gwh24 = gwAvg24 * 24;

          setText(root, "[data-hr-power]", Number.isFinite(gw) ? `${fmtNum(gw, 2)} GW` : "—");
          setText(root, "[data-hr-e1]", Number.isFinite(gwh1) ? `${fmtNum(gwh1, 2)} GWh` : "—");
          setText(root, "[data-hr-e24]", Number.isFinite(gwh24) ? `${fmtNum(gwh24, 1)} GWh` : "—");

          // Tor fields: no public canonical feed (keep stable placeholders)
          setText(root, "[data-hr-tor]", "—");
          setText(root, "[data-hr-tor-note]", "no public feed");

          if (sub) sub.textContent = "Source: mempool.space (hashrate 3d + difficulty-adjustment)";
          this._lastNetAt = Date.now();
        }catch(e){
          if (sub) sub.textContent = `error: ${String(e?.message || e)}`;
          if (DEBUG) console.warn("[hashrate] update failed", e);
          this._lastNetAt = Date.now(); // back off
        }finally{
          this._busy = false;
        }
      };

      // immediate + loop
      tick();
      this._t = setInterval(tick, UI_TICK_MS);
    },

    stop(){
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
