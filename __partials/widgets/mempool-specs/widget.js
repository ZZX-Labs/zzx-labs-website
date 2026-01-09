// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT (FIXES "modules missing")
//
// What this fixes:
// - Auto-loads REQUIRED submodules from the SAME widget dir, exactly once:
//   fetch.js, txfetcher.js, scaler.js, themes.js, grid.js, sorter.js, plotter.js, animation.js
// - Uses fetch.js (ZZXMempoolSpecsFetch) and passes it into TxFetcher via ctx,
//   so your AllOrigins/cache/rate-limit handling is actually used.
// - Keeps the DOM contract you already shipped (data-ms-summary, data-ms-sub, data-ms-block).
// - Draws immediately (even before first network fetch) so the box is never blank.
//
// Notes:
// - This is the histogram-driven “block/0 fill” visual (fast + stable).
// - No Bitnodes. No extra endpoints. mempool.space only (via fetch.js).
//
(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const NS = (W.ZZXMempoolSpecs = W.ZZXMempoolSpecs || {});
  const MEMPOOL_BASE = "https://mempool.space/api";

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function qs(root, sel) { return root ? root.querySelector(sel) : null; }

  function setText(root, sel, txt) {
    const el = qs(root, sel);
    if (el) el.textContent = String(txt ?? "");
  }

  function ensureCanvasInBlock(root) {
    const host = qs(root, "[data-ms-block]");
    if (!host) return null;

    let canvas = host.querySelector("canvas[data-canvas]");
    if (canvas) return canvas;

    canvas = document.createElement("canvas");
    canvas.setAttribute("data-canvas", "1");
    host.appendChild(canvas);
    return canvas;
  }

  // -----------------------------
  // Script loader
  // -----------------------------
  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/mempool-specs/";
  }

  async function loadOnce(url, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      // allow the script’s globals to settle
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

  async function ensureDeps() {
    const base = widgetBasePath();

    const deps = [
      // order matters: Theme used by Plotter; Anim used by widget; etc.
      ["fetch.js",     "zzx:ms:fetch",     () => W.ZZXMempoolSpecsFetch?.fetchJSON],
      ["txfetcher.js", "zzx:ms:txfetcher", () => W.ZZXMempoolSpecs?.TxFetcher],
      ["scaler.js",    "zzx:ms:scaler",    () => W.ZZXMempoolSpecs?.Scaler],
      ["themes.js",    "zzx:ms:themes",    () => W.ZZXMempoolSpecs?.Theme],
      ["grid.js",      "zzx:ms:grid",      () => W.ZZXMempoolSpecs?.Grid],
      ["sorter.js",    "zzx:ms:sorter",    () => W.ZZXMempoolSpecs?.Sorter],
      ["plotter.js",   "zzx:ms:plotter",   () => W.ZZXMempoolSpecs?.Plotter],
      ["animation.js", "zzx:ms:anim",      () => W.ZZXMempoolSpecs?.Anim?.Anim],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} missing` };
      await new Promise(r => setTimeout(r, 0));
      if (!okfn()) return { ok: false, why: `${file} did not register` };
    }

    return { ok: true };
  }

  // -----------------------------
  // Histogram -> pseudo tx squares
  // -----------------------------
  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map((x) => Array.isArray(x) ? [Number(x[0]), Number(x[1])] : [NaN, NaN])
      .filter(([fee, vsize]) => Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0);

    rows.sort((a, b) => b[0] - a[0]); // highest fee first

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

  function bandsToSquares(picked, scaler, seed = 0) {
    const out = [];
    let n = 0;

    const MAX_SQUARES = 420;
    const MIN_CHUNK_VB = 900;

    for (const band of picked) {
      const vb = Number(band.vbytes) || 0;
      const fee = Number(band.feeRate) || 0;
      if (vb <= 0) continue;

      let chunks = Math.floor(vb / 12_000);
      chunks = Math.max(1, Math.min(24, chunks));

      const chunkVb = Math.max(MIN_CHUNK_VB, Math.floor(vb / chunks));

      for (let i = 0; i < chunks; i++) {
        if (out.length >= MAX_SQUARES) break;

        const vbi = (i === chunks - 1) ? (vb - chunkVb * (chunks - 1)) : chunkVb;
        const side = scaler.sideCellsFromVBytes(vbi);

        out.push({
          txid: `band:${fee}:${seed}:${n++}:${i}`,
          feeRate: fee,
          vbytes: vbi,
          side
        });
      }
      if (out.length >= MAX_SQUARES) break;
    }

    return out;
  }

  function gridSignature(grid) {
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}`;
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

      inflight: false,
      timer: null
    };
  }

  function shouldFetch(st) {
    return (Date.now() - st.lastAt) > 15_000;
  }

  // -----------------------------
  // Fetch snapshot (via fetch.js)
  // -----------------------------
  async function fetchSnapshot(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      const Fetch = W.ZZXMempoolSpecsFetch;

      // ctx adapters: TxFetcher expects ctx.fetchJSON/fetchText to return the *payload*,
      // but your fetch.js returns {ok,json,from}. We normalize here.
      const ctx = {
        api: { MEMPOOL: MEMPOOL_BASE },
        fetchJSON: async (url, opts = {}) => {
          const r = await Fetch.fetchJSON(url, opts);
          return r?.json;
        },
        fetchText: async (url, opts = {}) => {
          const r = await Fetch.fetchText(url, opts);
          return r?.text;
        }
      };

      if (!st.fetcher) st.fetcher = new W.ZZXMempoolSpecs.TxFetcher({ ctx, base: MEMPOOL_BASE, minIntervalMs: 15_000 });

      const snap = await st.fetcher.snapshot({ force: true });
      st.lastAt = snap.at || Date.now();
      st.lastTip = snap.tipHeight ?? null;
      st.lastHist = snap.feeHistogram ?? null;

      return snap;
    } finally {
      st.inflight = false;
    }
  }

  // -----------------------------
  // Build + paint
  // -----------------------------
  function buildLayoutFromHistogram(hist, grid, st) {
    const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);
    const seed = (Number(st.lastTip) || 0) ^ (picked.length << 16);

    const squares = bandsToSquares(picked, st.scaler, seed);
    const layout = W.ZZXMempoolSpecs.Sorter.packSquares(squares, grid, { seed, bubblePasses: 1 });

    const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
    const meta =
      `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()} · tiles: ${(layout?.placed?.length || 0)}`;

    return { layout, meta };
  }

  function paint(root, st) {
    const canvas = ensureCanvasInBlock(root);
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const Grid = W.ZZXMempoolSpecs.Grid;
    const Plotter = W.ZZXMempoolSpecs.Plotter;

    const grid = Grid.makeGrid(canvas, {
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
      setText(root, "[data-ms-summary]", "loading…");
      setText(root, "[data-ms-sub]", "pending transactions");
      Plotter.draw(ctx2d, canvas, grid, { placed: [] }, "loading…");
      return;
    }

    const { layout: newLayout, meta } = buildLayoutFromHistogram(hist, grid, st);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.lastTip ?? "—"} · source: mempool.space`);

    // first draw or resize -> hard draw
    if (!st.lastLayout || gridChanged) {
      Plotter.draw(ctx2d, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    // animate between layouts
    if (!st.anim) st.anim = new W.ZZXMempoolSpecs.Anim.Anim({ ms: 650 });

    const from = st.lastLayout;
    const to = newLayout;

    st.anim.play(from, to, (lay) => {
      Plotter.draw(ctx2d, canvas, grid, lay, meta);
    });

    st.lastLayout = newLayout;
  }

  async function tick(root, st) {
    if (!root || !root.isConnected) return;

    try {
      if (shouldFetch(st)) await fetchSnapshot(st);
      paint(root, st);
    } catch (e) {
      if (DEBUG) console.warn("[mempool-specs] tick failed", e);
      setText(root, "[data-ms-sub]", `error: ${String(e?.message || e)}`);
    }
  }

  function start(root, st) {
    if (st.timer) clearInterval(st.timer);

    // draw fast; fetch is throttled inside fetchSnapshot/TxFetcher
    st.timer = setInterval(() => tick(root, st), 900);
    tick(root, st);

    if (!root.__zzxMempoolSpecsResizeBound) {
      root.__zzxMempoolSpecsResizeBound = true;
      window.addEventListener("resize", () => {
        try { paint(root, st); } catch (_) {}
      });
    }
  }

  function boot(root) {
    if (!root) return;

    // Always create canvas so the orange frame area is never empty
    ensureCanvasInBlock(root);

    if (!root.__zzxMempoolSpecsState) root.__zzxMempoolSpecsState = makeState();
    const st = root.__zzxMempoolSpecsState;

    // IMPORTANT: deps are loaded here
    (async () => {
      setText(root, "[data-ms-summary]", "loading…");
      setText(root, "[data-ms-sub]", "pending transactions");

      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-ms-summary]", "mempool-specs modules missing");
        setText(root, "[data-ms-sub]", deps.why);
        return;
      }

      if (!st.scaler) st.scaler = new W.ZZXMempoolSpecs.Scaler();
      start(root, st);
    })().catch((e) => {
      setText(root, "[data-ms-summary]", "mempool-specs init error");
      setText(root, "[data-ms-sub]", String(e?.message || e));
      if (DEBUG) console.warn("[mempool-specs] boot error", e);
    });
  }

  // -----------------------------
  // Mount hooks
  // -----------------------------
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
