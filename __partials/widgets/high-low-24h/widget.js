// __partials/widgets/high-low-24h/widget.js
// DROP-IN REPLACEMENT
// - Ensures deps: fetch.js, sources.js, plotter.js, chart.js (auto-load from same dir)
// - Exchange selector persisted
// - AllOrigins RAW via ctx.fetchJSON or fetch.js
// - Computes 24h High/Low + % change, and draws combined price+volume chart

(function () {
  "use strict";

  const ID = "high-low-24h";
  const STORE_KEY = "zzx.hl24.exchange";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  const UI_TICK_MS = 750;
  const NET_MIN_MS = 5_000;

  function safeGet(k){ try{ return localStorage.getItem(k); }catch{ return null; } }
  function safeSet(k,v){ try{ localStorage.setItem(k, v); }catch{} }

  function fmtUSD(n){
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{ minimumFractionDigits:2, maximumFractionDigits:2 })
      : "—";
  }
  function pct(a,b){
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return ((a - b) / b) * 100;
  }
  function setDelta(el, p){
    if (!el) return;
    if (!Number.isFinite(p)){
      el.textContent = "—%";
      el.classList.remove("is-up","is-down");
      el.classList.add("is-flat");
      return;
    }
    el.textContent = (p>=0?"+":"") + p.toFixed(2) + "%";
    el.classList.remove("is-up","is-down","is-flat");
    if (p>0.0001) el.classList.add("is-up");
    else if (p<-0.0001) el.classList.add("is-down");
    else el.classList.add("is-flat");
  }

  function widgetBasePath(){
    const Core = window.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/high-low-24h/";
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

    if (!window.ZZXFetchHL?.json){
      const ok = await loadScriptOnce(base+"fetch.js", "zzx:hl24:fetch");
      if (!ok) return { ok:false, why:"fetch.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXFetchHL?.json) return { ok:false, why:"fetch.js did not register" };
    }

    if (!window.ZZXHLSources?.list){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:hl24:sources");
      if (!ok) return { ok:false, why:"sources.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXHLSources?.list) return { ok:false, why:"sources.js did not register" };
    }

    if (!window.ZZXHLPlotter?.sizeCanvas){
      const ok = await loadScriptOnce(base+"plotter.js", "zzx:hl24:plotter");
      if (!ok) return { ok:false, why:"plotter.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXHLPlotter?.sizeCanvas) return { ok:false, why:"plotter.js did not register" };
    }

    if (!window.ZZXHLChart?.draw){
      const ok = await loadScriptOnce(base+"chart.js", "zzx:hl24:chart");
      if (!ok) return { ok:false, why:"chart.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXHLChart?.draw) return { ok:false, why:"chart.js did not register" };
    }

    return { ok:true };
  }

  function populateSelect(sel, sources, chosenId){
    if (!sel) return;
    sel.replaceChildren();
    for (const s of sources){
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.label;
      sel.appendChild(o);
    }
    if (chosenId && sources.some(s=>s.id===chosenId)) sel.value = chosenId;
  }

  async function loadCandles(ctx, src){
    const json = await window.ZZXFetchHL.json(src.url, { ctx });
    const candles = src.normalize(json);
    // ensure enough for stable 24h display; take last 72 then last 24 in chart
    return (Array.isArray(candles) ? candles : []).slice(-72);
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl){
      this.root = slotEl;
      this._t = null;
      this._ctx = null;
      this._sources = null;
      this._srcId = null;
      this._busy = false;
      this._lastNetAt = 0;
      this._lastCandles = null;
    },

    async start(ctx){
      this._ctx = ctx || null;
      const root = this.root;
      if (!root) return;

      const $ = (s)=>root.querySelector(s);

      const outHigh  = $("[data-high]");
      const outLow   = $("[data-low]");
      const outDelta = $("[data-delta]");
      const outSub   = $("[data-sub]");
      const canvas   = $("[data-chart]");
      const sel      = root.querySelector("select[data-exchange]");

      const deps = await ensureDeps();
      if (!deps.ok){
        if (outSub) outSub.textContent = `error: ${deps.why}`;
        return;
      }

      const sources = window.ZZXHLSources.list() || [];
      this._sources = sources;

      if (!sources.length){
        if (outSub) outSub.textContent = "error: no sources";
        return;
      }

      const saved = safeGet(STORE_KEY);
      this._srcId = (saved && sources.some(s=>s.id===saved)) ? saved : sources[0].id;

      if (sel){
        populateSelect(sel, sources, this._srcId);
        sel.addEventListener("change", () => {
          this._srcId = sel.value;
          safeSet(STORE_KEY, this._srcId);
          this._lastNetAt = 0;
        });
      }

      const renderFrom = (candles) => {
        if (!candles || !candles.length) return;

        const tail = candles.slice(-24);
        const highs = tail.map(x=>Number(x.h)).filter(Number.isFinite);
        const lows  = tail.map(x=>Number(x.l)).filter(Number.isFinite);
        const closes = tail.map(x=>Number(x.c)).filter(Number.isFinite);

        const hi = highs.length ? Math.max(...highs) : null;
        const lo = lows.length  ? Math.min(...lows)  : null;

        if (outHigh) outHigh.textContent = fmtUSD(hi);
        if (outLow)  outLow.textContent  = fmtUSD(lo);

        // 24h delta based on close first->last
        const first = closes[0];
        const last  = closes[closes.length-1];
        setDelta(outDelta, pct(last, first));

        // draw combined chart (price+volume markers)
        try{
          window.ZZXHLChart.draw(canvas, candles, {});
        }catch(e){
          if (DEBUG) console.warn("[high-low-24h] chart draw failed", e);
        }
      };

      const tick = async () => {
        if (!root.isConnected) return;

        // always re-render quickly from cached candles (smoothness)
        if (this._lastCandles) renderFrom(this._lastCandles);

        if (this._busy) return;

        const now = Date.now();
        if ((now - this._lastNetAt) < NET_MIN_MS) return;

        this._busy = true;
        try{
          const src = sources.find(s=>s.id===this._srcId) || sources[0];
          if (outSub) outSub.textContent = `loading… (${src.label})`;

          const candles = await loadCandles(this._ctx, src);
          if (!candles.length) throw new Error("no candle data");

          this._lastCandles = candles;
          renderFrom(candles);

          if (outSub) outSub.textContent = `${src.label} · 1h candles · 24h hi/lo + volume`;
          this._lastNetAt = Date.now();
        }catch(e){
          if (outSub) outSub.textContent = `error: ${String(e?.message || e)}`;
          if (DEBUG) console.warn("[high-low-24h] fetch failed", e);
          this._lastNetAt = Date.now();
        }finally{
          this._busy = false;
        }
      };

      tick();
      this._t = setInterval(tick, UI_TICK_MS);
    },

    stop(){
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
