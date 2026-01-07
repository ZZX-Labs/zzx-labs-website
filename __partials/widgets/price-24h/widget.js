// __partials/widgets/price-24h/widget.js
// DROP-IN REPLACEMENT
// - Ensures deps: sources.js, plotter.js, chart.js (auto-load from same dir)
// - AllOrigins RAW fetch via ctx.fetchJSON or window.ZZXAO.json fallback
// - Normalized 1h candles -> price + % change + HL band chart
// - Fast UI loop; throttled network loop

(function () {
  "use strict";

  const ID = "price-24h";
  const STORE_KEY = "zzx.price24.exchange";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  const NET_MIN_MS = 5_000;
  const UI_TICK_MS = 750;

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

  function safeGet(k){ try{ return localStorage.getItem(k); }catch{ return null; } }
  function safeSet(k,v){ try{ localStorage.setItem(k, v); }catch{} }

  function widgetBasePath(){
    const Core = window.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/price-24h/";
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

    if (!window.ZZXPriceSources?.list){
      const ok = await loadScriptOnce(base+"sources.js", "zzx:price24:sources");
      if (!ok) return { ok:false, why:"sources.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXPriceSources?.list) return { ok:false, why:"sources.js did not register" };
    }

    if (!window.ZZXPlotter?.drawHL){
      const ok = await loadScriptOnce(base+"plotter.js", "zzx:price24:plotter");
      if (!ok) return { ok:false, why:"plotter.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXPlotter?.drawHL) return { ok:false, why:"plotter.js did not register" };
    }

    if (!window.ZZXChart?.drawPrice24){
      const ok = await loadScriptOnce(base+"chart.js", "zzx:price24:chart");
      if (!ok) return { ok:false, why:"chart.js missing" };
      await new Promise(r=>setTimeout(r,0));
      if (!window.ZZXChart?.drawPrice24) return { ok:false, why:"chart.js did not register" };
    }

    return { ok:true };
  }

  async function fetchJSON(ctx, url){
    if (ctx?.fetchJSON) return await ctx.fetchJSON(url);
    if (window.ZZXAO?.json) return await window.ZZXAO.json(url);
    const AO_RAW = "https://api.allorigins.win/raw?url=";
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), { cache:"no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function loadCandles(ctx, src){
    const json = await fetchJSON(ctx, src.url);
    const candles = src.normalize(json);
    return (Array.isArray(candles) ? candles : []).slice(-24);
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

  window.ZZXWidgets.register(ID, {
    mount(slotEl){
      this.root = slotEl;
      this._t = null;
      this._ctx = null;
      this._sources = null;
      this._srcId = null;
      this._busy = false;
      this._lastNetAt = 0;
    },

    async start(ctx){
      this._ctx = ctx || null;

      const root = this.root;
      if (!root) return;

      const $ = (s)=>root.querySelector(s);
      const outPrice = $("[data-price]");
      const outDelta = $("[data-delta]");
      const outSub   = $("[data-sub]");
      const canvas   = $("[data-chart]");
      const sel      = root.querySelector("select[data-exchange]");

      const deps = await ensureDeps();
      if (!deps.ok){
        if (outSub) outSub.textContent = `error: ${deps.why}`;
        return;
      }

      const sources = window.ZZXPriceSources.list() || [];
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

      const tick = async () => {
        if (!root.isConnected) return;
        if (this._busy) return;

        const now = Date.now();
        if ((now - this._lastNetAt) < NET_MIN_MS) return;

        this._busy = true;
        try{
          const src = sources.find(s=>s.id===this._srcId) || sources[0];
          if (outSub) outSub.textContent = `loading… (${src.label})`;

          const candles = await loadCandles(this._ctx, src);
          if (!candles.length) throw new Error("no candle data");

          const first = Number(candles[0]?.c);
          const last  = Number(candles[candles.length-1]?.c);

          if (outPrice) outPrice.textContent = fmtUSD(last);

          const p = pct(last, first);
          setDelta(outDelta, p);

          try{
            window.ZZXChart.drawPrice24(canvas, candles, Number.isFinite(p) ? (p >= 0) : true);
          }catch(e){
            if (DEBUG) console.warn("[price-24h] chart draw failed", e);
          }

          if (outSub) outSub.textContent = `${src.label} · 1h candles · ${candles.length} pts`;
          this._lastNetAt = Date.now();
        }catch(e){
          if (outSub) outSub.textContent = `error: ${String(e?.message || e)}`;
          if (DEBUG) console.warn("[price-24h] fetch failed", e);
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
