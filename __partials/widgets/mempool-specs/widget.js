// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT — mempool-specs
//
// Requires these globals to be loaded BEFORE this widget runs:
//   window.ZZXMempoolSpecsFetch.fetchJSON / fetchText   (from fetch.js you pasted)
//   window.ZZXMempoolSpecs.TxFetcher                    (txfetcher.js)
//   window.ZZXMempoolSpecs.Grid
//   window.ZZXMempoolSpecs.Sorter
//   window.ZZXMempoolSpecs.Plotter
//   window.ZZXMempoolSpecs.Theme
//   window.ZZXMempoolSpecs.Scaler
//   window.ZZXMempoolSpecs.Anim.Anim
//
// Network:
// - Uses your fetch.js (direct → allorigins → cache) through ctx injection.
// - TxFetcher only sees raw json/text (no wrapper objects).
//
// Visual:
// - DPR-aware canvas
// - Builds a pseudo block fill from fee histogram (fast, stable)

(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";

  const MEMPOOL = "https://mempool.space/api";

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const NS = (W.ZZXMempoolSpecs = W.ZZXMempoolSpecs || {});
  const Fetch = W.ZZXMempoolSpecsFetch;

  const Grid    = NS.Grid;
  const Sorter  = NS.Sorter;
  const Plotter = NS.Plotter;
  const Theme   = NS.Theme;
  const ScalerC = NS.Scaler;
  const AnimC   = NS.Anim?.Anim;
  const TxFetcherC = NS.TxFetcher;

  function havePipeline() {
    return !!(Fetch?.fetchJSON && Fetch?.fetchText && Grid && Sorter && Plotter && Theme && ScalerC && AnimC && TxFetcherC);
  }

  function qs(root, sel) { return root ? root.querySelector(sel) : null; }

  function setText(root, sel, txt) {
    const el = qs(root, sel);
    if (el) el.textContent = txt;
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
  // Histogram -> pseudo items
  // -----------------------------
  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map(([fee, vsize]) => [Number(fee), Number(vsize)])
      .filter(([fee, vsize]) => Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0);

    rows.sort((a, b) => b[0] - a[0]);

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

  function gridSignature(grid) {
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}`;
  }

  // -----------------------------
  // Fetch snapshot via TxFetcher
  // -----------------------------
  async function fetchSnapshot(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      // ctx wrappers MUST return raw text/json (not {ok, ...})
      const ctx = {
        api: { MEMPOOL },

        fetchJSON: async (url, { signal } = {}) => {
          const r = await Fetch.fetchJSON(url, { signal });
          // keep a hint for UI/debug if you want it later:
          ctx._lastFrom = r.from;
          return r.json;
        },

        fetchText: async (url, { signal } = {}) => {
          const r = await Fetch.fetchText(url, { signal });
          ctx._lastFrom = r.from;
          return r.text;
        }
      };

      if (!st.fetcher) st.fetcher = new TxFetcherC({ ctx, base: MEMPOOL, minIntervalMs: 15_000 });

      const snap = await st.fetcher.snapshot({ force: true });

      st.lastAt = snap.at || Date.now();
      st.lastTip = snap.tipHeight ?? null;
      st.lastHist = snap.feeHistogram ?? null;

      return snap;
    } finally {
      st.inflight = false;
    }
  }

  function buildLayoutFromHistogram(hist, grid, st) {
    const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);

    const seed = (Number(st.lastTip) || 0) ^ (picked.length << 16);

    const squares = bandsToSquares(picked, st.scaler, seed);

    const layout = Sorter.packSquares(squares, grid, {
      seed,
      bubblePasses: 1
    });

    const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
    const meta =
      `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()} · tiles: ${layout.placed.length}`;

    return { layout, meta };
  }

  function paint(root, st) {
    const canvas = ensureCanvasInBlock(root);
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

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
      setText(root, "[data-ms-summary]", "mempool data unavailable");
      setText(root, "[data-ms-sub]", "—");
      Plotter.draw(ctx2d, canvas, grid, { placed: [] }, "mempool data unavailable");
      return;
    }

    const { layout: newLayout, meta } = buildLayoutFromHistogram(hist, grid, st);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.lastTip ?? "—"} · source: mempool.space`);

    if (!st.lastLayout || gridChanged) {
      Plotter.draw(ctx2d, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    if (!st.anim) st.anim = new AnimC({ ms: 650 });

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
      if (DEBUG) console.warn("[ZZX:MEMPOOL-SPECS] tick failed", e);
      setText(root, "[data-ms-sub]", `error: ${String(e?.message || e)}`);
    }
  }

  function start(root, st) {
    if (st.timer) clearInterval(st.timer);

    st.timer = setInterval(() => tick(root, st), 850);
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

    if (!havePipeline()) {
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", "ensure fetch/txfetcher/scaler/themes/grid/sorter/plotter/animation are loaded");
      return;
    }

    if (!root.__zzxMempoolSpecsState) root.__zzxMempoolSpecsState = makeState();
    const st = root.__zzxMempoolSpecsState;

    if (!st.scaler) st.scaler = new ScalerC();

    ensureCanvasInBlock(root);
    start(root, st);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }

})();
