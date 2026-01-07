// __partials/widgets/price-24h/widget.js
// DROP-IN REPLACEMENT
// - Exchange selector (local, persisted)
// - AllOrigins RAW fetch
// - Normalized 1h candles -> 24h price + % change + spark chart
// - Fetch cadence is sane (network every 30s); rendering is immediate.

(function () {
  "use strict";

  const ID = "price-24h";
  const STORE_KEY = "zzx.price24.exchange";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

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
    const s = (p>=0?"+":"") + p.toFixed(2) + "%";
    el.textContent = s;
    el.classList.remove("is-up","is-down","is-flat");
    if (p>0.0001) el.classList.add("is-up");
    else if (p<-0.0001) el.classList.add("is-down");
    else el.classList.add("is-flat");
  }

  function safeGet(k){
    try{ return localStorage.getItem(k); }catch{ return null; }
  }
  function safeSet(k,v){
    try{ localStorage.setItem(k, v); }catch{}
  }

  async function loadCandles(src){
    // expects window.ZZXAO.json and src.normalize
    const json = await window.ZZXAO.json(src.url);
    const candles = src.normalize(json);
    // Use last 24 points if more exist
    const tail = candles.slice(-24);
    return tail;
  }

  function populateSelect(sel, sources, chosenId){
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
      this._srcId = null;
      this._busy = false;
      this._lastNetAt = 0;
    },

    start(){
      const root = this.root;
      if (!root) return;

      const $ = (s)=>root.querySelector(s);
      const outPrice = $("[data-price]");
      const outDelta = $("[data-delta]");
      const outSub   = $("[data-sub]");
      const canvas   = $("[data-spark]");
      const sel      = root.querySelector("select[data-exchange]");

      const sources = (window.ZZXPriceSources?.list ? window.ZZXPriceSources.list() : []);
      if (!sources.length){
        if (outSub) outSub.textContent = "error: sources.js missing";
        return;
      }

      // init choice
      const saved = safeGet(STORE_KEY);
      this._srcId = (saved && sources.some(s=>s.id===saved)) ? saved : sources[0].id;

      if (sel){
        populateSelect(sel, sources, this._srcId);
        sel.addEventListener("change", () => {
          this._srcId = sel.value;
          safeSet(STORE_KEY, this._srcId);
          this._lastNetAt = 0; // force refresh
        });
      }

      const tick = async () => {
        if (!root.isConnected) return;
        if (this._busy) return;

        const now = Date.now();
        const needNet = (now - this._lastNetAt) > 30_000; // network cadence
        if (!needNet) return;

        this._busy = true;
        try{
          const src = sources.find(s=>s.id===this._srcId) || sources[0];

          if (outSub) outSub.textContent = `loading… (${src.label})`;

          const candles = await loadCandles(src);
          if (!candles.length) throw new Error("no candle data");

          const closes = candles.map(x=>Number(x.c)).filter(Number.isFinite);
          const first = closes[0];
          const last  = closes[closes.length-1];

          if (outPrice) outPrice.textContent = fmtUSD(last);

          const p = pct(last, first);
          setDelta(outDelta, p);

          // draw spark
          try{
            window.ZZXSpark?.drawPrice?.(canvas, closes, Number.isFinite(p) ? (p >= 0) : true);
          }catch(e){
            if (DEBUG) console.warn("[price-24h] spark draw failed", e);
          }

          // sublabel
          const points = closes.length;
          if (outSub) outSub.textContent = `${src.label} · 1h candles · ${points} pts`;

          this._lastNetAt = Date.now();
        }catch(e){
          if (outSub) outSub.textContent = `error: ${String(e?.message || e)}`;
          if (DEBUG) console.warn("[price-24h] fetch failed", e);
          this._lastNetAt = Date.now(); // back off to cadence
        }finally{
          this._busy = false;
        }
      };

      // fast UI loop, slow network gate
      tick();
      this._t = setInterval(tick, 750);
    },

    stop(){
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
