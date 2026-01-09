// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT (SELF-LOADING, FAIL-LOUD)
//
// Fixes “loading…” forever by:
// - auto-loading required modules from same directory
// - hard error reporting into [data-ms-sub]
// - using ZZXMempoolSpecsFetch (direct -> AllOrigins -> cache) for ALL network
// - stable timers, idempotent mount
//
// Requires these sibling files in /__partials/widgets/mempool-specs/:
//   fetch.js, txfetcher.js, scaler.js, themes.js, grid.js, sorter.js, plotter.js, animation.js
//
// Exposes nothing; registers widget "mempool-specs" into your widget system.
(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const log = (...a) => DEBUG && console.log("[ZZX:MEMPOOL-SPECS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[ZZX:MEMPOOL-SPECS]", ...a);

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function qs(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, txt) {
    const el = qs(root, sel);
    if (el) el.textContent = String(txt ?? "");
  }

  function ensureCanvas(root) {
    const host = qs(root, "[data-ms-block]");
    if (!host) return null;

    let c = host.querySelector("canvas[data-canvas]");
    if (c) return c;

    c = document.createElement("canvas");
    c.setAttribute("data-canvas", "1");
    host.appendChild(c);
    return c;
  }

  // -----------------------------
  // Module loader (like NBV)
  // -----------------------------
  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/mempool-specs/";
  }

  async function loadOnce(url, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      await new Promise(r => setTimeout(r, 0));
      return true;
    }
    return await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function haveAll() {
    const NS = W.ZZXMempoolSpecs;
    return !!(
      W.ZZXMempoolSpecsFetch?.fetchJSON &&
      NS?.TxFetcher &&
      NS?.Scaler &&
      NS?.Theme &&
      NS?.Grid &&
      NS?.Sorter?.packSquares &&
      NS?.Plotter?.draw &&
      NS?.Anim?.Anim
    );
  }

  async function ensureDeps() {
    const base = widgetBasePath();
    const deps = [
      ["fetch.js",     "zzx:ms:fetch",     () => !!W.ZZXMempoolSpecsFetch?.fetchJSON],
      ["txfetcher.js", "zzx:ms:txfetcher", () => !!W.ZZXMempoolSpecs?.TxFetcher],
      ["scaler.js",    "zzx:ms:scaler",    () => !!W.ZZXMempoolSpecs?.Scaler],
      ["themes.js",    "zzx:ms:themes",    () => !!W.ZZXMempoolSpecs?.Theme],
      ["grid.js",      "zzx:ms:grid",      () => !!W.ZZXMempoolSpecs?.Grid],
      ["sorter.js",    "zzx:ms:sorter",    () => !!W.ZZXMempoolSpecs?.Sorter?.packSquares],
      ["plotter.js",   "zzx:ms:plotter",   () => !!W.ZZXMempoolSpecs?.Plotter?.draw],
      ["animation.js", "zzx:ms:anim",      () => !!W.ZZXMempoolSpecs?.Anim?.Anim],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} failed to load (${base}${file})` };
      await new Promise(r => setTimeout(r, 0));
      if (!okfn()) return { ok: false, why: `${file} loaded but did not register` };
    }
    return { ok: true };
  }

  // -----------------------------
  // Histogram -> pseudo items
  // (this version outputs areaCells, enabling treemap sorter)
  // -----------------------------
  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map(([fee, vsize]) => [Number(fee), Number(vsize)])
      .filter(([fee, vsize]) => Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0);

    rows.sort((a, b) => b[0] - a[0]); // high fee first

    let used = 0;
    const picked = [];
    for (const [fee, vsize] of rows) {
      if (used >= targetVSize) break;
      const take = Math.min(vsize, targetVSize - used);
      if (take <= 0) continue;
      picked.push({ feeRate: fee, vbytes: take });
      used += take;
    }
    return { picked, used, targetVSize };
  }

  function bandsToRects(picked, scaler, seed = 0) {
    const out = [];
    let n = 0;

    // More items => denser micro-tiles. Keep bounded for mobile.
    const MAX_ITEMS = 1600;
    const MIN_CHUNK_VB = 220;  // allow many small tiles (mempool-like)
    const MAX_CHUNKS_PER_BAND = 220;

    for (const band of picked) {
      const vb = Number(band.vbytes) || 0;
      const fee = Number(band.feeRate) || 0;
      if (vb <= 0) continue;

      // choose chunks: proportional, but capped
      let chunks = Math.floor(vb / 1400);         // ~1 tile per 1.4k vB
      chunks = Math.max(1, Math.min(MAX_CHUNKS_PER_BAND, chunks));

      const chunkVb = Math.max(MIN_CHUNK_VB, Math.floor(vb / chunks));

      for (let i = 0; i < chunks; i++) {
        if (out.length >= MAX_ITEMS) break;

        const vbi = (i === chunks - 1) ? (vb - chunkVb * (chunks - 1)) : chunkVb;

        const areaCells =
          (typeof scaler.areaCellsFromTx === "function")
            ? scaler.areaCellsFromTx({ vbytes: vbi, feeRate: fee })
            : (typeof scaler.areaCellsFromVBytes === "function")
              ? scaler.areaCellsFromVBytes(vbi)
              : 1;

        out.push({
          txid: `band:${fee}:${seed}:${n++}:${i}`,
          feeRate: fee,
          vbytes: vbi,
          areaCells
        });
      }
      if (out.length >= MAX_ITEMS) break;
    }

    return out;
  }

  // -----------------------------
  // State
  // -----------------------------
  function makeState() {
    return {
      fetcher: null,
      scaler: null,
      anim: null,

      lastAt: 0,
      lastTip: null,
      lastHist: null,
      lastLayout: null,
      lastGridSig: "",

      timer: null,
      inflight: false,
    };
  }

  function gridSignature(grid) {
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}`;
  }

  function shouldFetch(st) {
    return (Date.now() - st.lastAt) > 15_000;
  }

  // -----------------------------
  // Network (ALWAYS via ZZXMempoolSpecsFetch)
  // -----------------------------
  const MEMPOOL_BASE = "https://mempool.space/api";

  function makeCtx() {
    // Note: txfetcher.js in your repo currently uses raw fetch().
    // We bypass that by giving it ctx.fetchText/fetchJSON, but ONLY if it supports ctx.
    // If it doesn’t, widget still fetches via ctx and can set st.lastHist directly.
    return {
      api: { MEMPOOL: MEMPOOL_BASE },
      fetchJSON: async (url, { signal } = {}) => {
        const r = await W.ZZXMempoolSpecsFetch.fetchJSON(url, { signal });
        return r.json;
      },
      fetchText: async (url, { signal } = {}) => {
        const r = await W.ZZXMempoolSpecsFetch.fetchText(url, { signal });
        return r.text;
      },
    };
  }

  async function fetchSnapshot(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      const NS = W.ZZXMempoolSpecs;
      const TxFetcher = NS.TxFetcher;

      // Prefer TxFetcher if it supports ctx; otherwise do minimal fetch here.
      if (!st.fetcher) {
        try {
          st.fetcher = new TxFetcher({
            base: MEMPOOL_BASE,
            minIntervalMs: 15_000,
            ctx: makeCtx(), // ok if txfetcher ignores it; we handle fallback
          });
        } catch (e) {
          st.fetcher = null;
        }
      }

      // 1) Try txfetcher.snapshot()
      if (st.fetcher && typeof st.fetcher.snapshot === "function") {
        try {
          const snap = await st.fetcher.snapshot({ force: true });
          st.lastAt = snap.at || Date.now();
          st.lastTip = snap.tipHeight ?? null;
          st.lastHist = snap.feeHistogram ?? null;
          return snap;
        } catch (e) {
          // fall through to direct fetch
          warn("txfetcher snapshot failed", e);
        }
      }

      // 2) Fallback: direct endpoints via fetch.js
      const ctx = makeCtx();

      let tipHeight = null;
      try {
        const t = await ctx.fetchText(`${MEMPOOL_BASE}/blocks/tip/height`);
        const n = parseInt(String(t).trim(), 10);
        if (Number.isFinite(n)) tipHeight = n;
      } catch {}

      let feeHistogram = null;
      try {
        const mem = await ctx.fetchJSON(`${MEMPOOL_BASE}/mempool`);
        if (mem && typeof mem === "object" && Array.isArray(mem.fee_histogram)) {
          feeHistogram = mem.fee_histogram;
        }
      } catch {}

      const snap = {
        at: Date.now(),
        tipHeight,
        tipHash: null,
        mempool: null,
        feeHistogram,
      };

      st.lastAt = snap.at;
      st.lastTip = tipHeight;
      st.lastHist = feeHistogram;
      return snap;
    } finally {
      st.inflight = false;
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  function buildLayoutFromHistogram(hist, grid, st) {
    const NS = W.ZZXMempoolSpecs;

    const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);
    const seed = (Number(st.lastTip) || 0) ^ (picked.length << 16);

    const items = bandsToRects(picked, st.scaler, seed);

    // IMPORTANT: sorter now produces x,y,w,h (treemap)
    const layout = NS.Sorter.packSquares(items, grid, { seed });

    const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
    const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()} · tiles: ${layout.placed.length}`;
    return { layout, meta };
  }

  function paint(root, st) {
    const NS = W.ZZXMempoolSpecs;

    const canvas = ensureCanvas(root);
    if (!canvas) throw new Error("canvas missing");

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("2D context missing");

    const grid = NS.Grid.makeGrid(canvas, {
      minCssH: 220,
      cellCss: 7,
      gapCss: 1,
      padCss: 10
    });

    const sig = gridSignature(grid);
    const gridChanged = (sig !== st.lastGridSig);
    st.lastGridSig = sig;

    const hist = st.lastHist;
    if (!hist) {
      setText(root, "[data-ms-summary]", "mempool data unavailable");
      setText(root, "[data-ms-sub]", "—");
      NS.Plotter.draw(ctx2d, canvas, grid, { placed: [] }, "mempool data unavailable");
      return;
    }

    const { layout: newLayout, meta } = buildLayoutFromHistogram(hist, grid, st);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.lastTip ?? "—"} · source: mempool.space`);

    if (!st.lastLayout || gridChanged) {
      NS.Plotter.draw(ctx2d, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    if (!st.anim) st.anim = new NS.Anim.Anim({ ms: 650 });

    st.anim.play(st.lastLayout, newLayout, (lay) => {
      NS.Plotter.draw(ctx2d, canvas, grid, lay, meta);
    });

    st.lastLayout = newLayout;
  }

  async function tick(root, st) {
    if (!root || !root.isConnected) return;

    try {
      if (shouldFetch(st)) await fetchSnapshot(st);
      paint(root, st);
    } catch (e) {
      const msg = String(e?.message || e);
      setText(root, "[data-ms-sub]", `error: ${msg}`);
      if (DEBUG) warn("tick failed", e);
    }
  }

  function start(root, st) {
    if (st.timer) clearInterval(st.timer);

    // fast repaint cadence; fetch is throttled
    st.timer = setInterval(() => tick(root, st), 900);
    tick(root, st);

    if (!root.__zzxMempoolSpecsResizeBound) {
      root.__zzxMempoolSpecsResizeBound = true;
      window.addEventListener("resize", () => {
        try { paint(root, st); } catch (_) {}
      });
    }
  }

  function stop(st) {
    if (st?.timer) clearInterval(st.timer);
    if (st?.anim) st.anim.stop();
    if (st) st.timer = null;
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot(root) {
    if (!root) return;

    // clear old timer if reinjected
    if (root.__zzxMempoolSpecsState) {
      stop(root.__zzxMempoolSpecsState);
    } else {
      root.__zzxMempoolSpecsState = makeState();
    }

    setText(root, "[data-ms-summary]", "loading…");
    setText(root, "[data-ms-sub]", "loading modules…");

    ensureCanvas(root);

    const deps = await ensureDeps();
    if (!deps.ok) {
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", deps.why);
      return;
    }

    if (!haveAll()) {
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", "one or more modules loaded but not registered");
      return;
    }

    const st = root.__zzxMempoolSpecsState;
    const NS = W.ZZXMempoolSpecs;

    if (!st.scaler) st.scaler = new NS.Scaler();

    setText(root, "[data-ms-sub]", "loading mempool snapshot…");

    start(root, st);
  }

  // -----------------------------
  // Register with your widget system
  // -----------------------------
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => { boot(root); });
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  } else if (W.__ZZX_WIDGETS && typeof W.__ZZX_WIDGETS.register === "function") {
    try { W.__ZZX_WIDGETS.register(ID, function (root) { boot(root); }); } catch (_) {}
  } else {
    if (DEBUG) warn("no widget registry found");
  }
})();
