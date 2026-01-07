// __partials/widgets/price-24h/widget.js
// DROP-IN REPLACEMENT (price-24h)
// - Ensures sources.js is loaded (auto) before use
// - Exchange selector (optional in HTML; if absent, still works)
// - AllOrigins RAW fetch (via ctx.fetchJSON or window.ZZXAO.json fallback)
// - Normalized 1h candles -> 24h price + % change + spark chart
// - Fast UI loop; throttled network loop

(function () {
  "use strict";

  const ID = "price-24h";
  const STORE_KEY = "zzx.price24.exchange";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  // Default cadence: sane by default (you can tighten later)
  // NOTE: Exchanges will rate-limit if you hammer them; AllOrigins also has limits.
  const NET_MIN_MS = 5_000;   // 5s
  const UI_TICK_MS = 750;     // repaint / net gate check

  function fmtUSD(n) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
  }

  function pct(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return ((a - b) / b) * 100;
  }

  function setDelta(el, p) {
    if (!el) return;

    if (!Number.isFinite(p)) {
      el.textContent = "—%";
      el.classList.remove("is-up", "is-down");
      el.classList.add("is-flat");
      return;
    }

    el.textContent = (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
    el.classList.remove("is-up", "is-down", "is-flat");
    if (p > 0.0001) el.classList.add("is-up");
    else if (p < -0.0001) el.classList.add("is-down");
    else el.classList.add("is-flat");
  }

  function safeGet(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  }

  function widgetBasePath() {
    // Prefer core path resolver if present
    const Core = window.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/price-24h/";
  }

  async function ensureSourcesLoaded() {
    if (window.ZZXPriceSources?.list) return true;

    const key = "zzx:price-24h:sources";
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      // script already injected; give it a microtick to register
      await new Promise(r => setTimeout(r, 0));
      return !!window.ZZXPriceSources?.list;
    }

    const src = widgetBasePath() + "sources.js";

    const ok = await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });

    if (!ok) return false;

    await new Promise(r => setTimeout(r, 0));
    return !!window.ZZXPriceSources?.list;
  }

  function populateSelect(sel, sources, chosenId) {
    if (!sel) return;
    sel.replaceChildren();

    for (const s of sources) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.label;
      sel.appendChild(o);
    }

    if (chosenId && sources.some(s => s.id === chosenId)) sel.value = chosenId;
  }

  async function fetchJSON(ctx, url) {
    // 1) prefer ctx.fetchJSON (your unified runtime likely wraps AllOrigins already)
    if (ctx?.fetchJSON) return await ctx.fetchJSON(url);

    // 2) fall back to window.ZZXAO.json (your AllOrigins helper)
    if (window.ZZXAO?.json) return await window.ZZXAO.json(url);

    // 3) last resort: raw fetch via AllOrigins RAW
    const AO_RAW = "https://api.allorigins.win/raw?url=";
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function loadCandles(ctx, src) {
    const json = await fetchJSON(ctx, src.url);
    const candles = src.normalize(json);

    // Use last 24 points if more exist
    return (Array.isArray(candles) ? candles : []).slice(-24);
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.root = slotEl;
      this._t = null;

      this._srcId = null;
      this._busy = false;
      this._lastNetAt = 0;

      this._sources = null;
      this._ctx = null;
    },

    async start(ctx) {
      this._ctx = ctx || null;

      const root = this.root;
      if (!root) return;

      const $ = (s) => root.querySelector(s);
      const outPrice = $("[data-price]");
      const outDelta = $("[data-delta]");
      const outSub   = $("[data-sub]");
      const canvas   = $("[data-spark]");
      const sel      = root.querySelector("select[data-exchange]"); // optional

      // Ensure sources.js exists
      const ok = await ensureSourcesLoaded();
      if (!ok) {
        if (outSub) outSub.textContent = "error: sources.js missing";
        return;
      }

      const sources = window.ZZXPriceSources.list() || [];
      this._sources = sources;

      if (!sources.length) {
        if (outSub) outSub.textContent = "error: no sources";
        return;
      }

      // init choice (persisted)
      const saved = safeGet(STORE_KEY);
      this._srcId = (saved && sources.some(s => s.id === saved)) ? saved : sources[0].id;

      // selector (if present)
      if (sel) {
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
        const needNet = (now - this._lastNetAt) >= NET_MIN_MS;
        if (!needNet) return;

        this._busy = true;
        try {
          const src = sources.find(s => s.id === this._srcId) || sources[0];
          if (outSub) outSub.textContent = `loading… (${src.label})`;

          const candles = await loadCandles(this._ctx, src);
          if (!candles.length) throw new Error("no candle data");

          const closes = candles.map(x => Number(x.c)).filter(Number.isFinite);
          if (closes.length < 2) throw new Error("insufficient candle closes");

          const first = closes[0];
          const last  = closes[closes.length - 1];

          if (outPrice) outPrice.textContent = fmtUSD(last);

          const p = pct(last, first);
          setDelta(outDelta, p);

          // sparkline draw (your shared utility)
          try {
            window.ZZXSpark?.drawPrice?.(canvas, closes, Number.isFinite(p) ? (p >= 0) : true);
          } catch (e) {
            if (DEBUG) console.warn("[price-24h] spark draw failed", e);
          }

          if (outSub) outSub.textContent = `${src.label} · 1h candles · ${closes.length} pts`;
          this._lastNetAt = Date.now();
        } catch (e) {
          if (outSub) outSub.textContent = `error: ${String(e?.message || e)}`;
          if (DEBUG) console.warn("[price-24h] fetch failed", e);
          this._lastNetAt = Date.now(); // back off
        } finally {
          this._busy = false;
        }
      };

      tick();
      this._t = setInterval(tick, UI_TICK_MS);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
