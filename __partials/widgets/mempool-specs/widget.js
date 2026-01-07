// __partials/widgets/mempool-specs/widget.js
// DROP-IN REPLACEMENT (core-compatible) — mempool-specs
//
// Integrates:
//   txfetcher.js  -> window.ZZXMempoolSpecs.TxFetcher
//   scaler.js     -> window.ZZXMempoolSpecs.Scaler
//   themes.js     -> window.ZZXMempoolSpecs.Theme
//   grid.js       -> window.ZZXMempoolSpecs.Grid
//   sorter.js     -> window.ZZXMempoolSpecs.Sorter
//   plotter.js    -> window.ZZXMempoolSpecs.Plotter
//   animation.js  -> window.ZZXMempoolSpecs.Anim
//
// Network:
// - Uses AllOrigins RAW for mempool.space API.
//
// Visual:
// - DPR-aware canvas
// - Builds a "block/0 fill" square pack using fee histogram (fast + robust)
// - Draws using Plotter (fee->color)
// - Animates between layouts using Anim
//
// Notes:
// - This is the “precursor” (histogram-derived) block fill.
// - When you’re ready, swap the item source from histogram -> real tx list (blockTxids + /tx).
//   The packing/plotting pipeline remains identical.

(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";

  const MEMPOOL = "https://mempool.space/api";
  const AO_RAW  = "https://api.allorigins.win/raw?url=";

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX:MEMPOOL-SPECS]", ...a);

  // -----------------------------
  // Require modules (fail-soft)
  // -----------------------------
  const NS      = (W.ZZXMempoolSpecs = W.ZZXMempoolSpecs || {});
  const Grid    = NS.Grid;
  const Sorter  = NS.Sorter;
  const Plotter = NS.Plotter;
  const Theme   = NS.Theme;
  const ScalerC = NS.Scaler;
  const AnimC   = NS.Anim?.Anim;
  const TxFetcherC = NS.TxFetcher; // you renamed NS in txfetcher.js per mempool-specs

  function havePipeline() {
    return !!(Grid && Sorter && Plotter && Theme && ScalerC && AnimC && TxFetcherC);
  }

  // -----------------------------
  // AllOrigins fetch wrappers
  // -----------------------------
  function aoUrl(u) { return AO_RAW + encodeURIComponent(String(u)); }

  async function aoText(u, { signal } = {}) {
    const r = await fetch(aoUrl(u), { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  async function aoJSON(u, { signal } = {}) {
    const r = await fetch(aoUrl(u), { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function qs(root, sel) { return root ? root.querySelector(sel) : null; }

  function ensureCanvasInBlock(root) {
    const host = qs(root, "[data-ms-block]");
    if (!host) return null;

    let canvas = host.querySelector("canvas[data-canvas]");
    if (canvas) return canvas;

    canvas = document.createElement("canvas");
    canvas.setAttribute("data-canvas", "1");
    // CSS will control display sizing; JS sets DPR buffer via Grid.ensureCanvas/makeGrid.
    host.appendChild(canvas);
    return canvas;
  }

  function setText(root, sel, txt) {
    const el = qs(root, sel);
    if (el) el.textContent = txt;
  }

  // -----------------------------
  // Histogram -> pseudo items
  // -----------------------------
  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map(([fee, vsize]) => [Number(fee), Number(vsize)])
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

  // Turn picked fee bands into “tx-like” squares:
  // - We split each band into chunkSquares so we actually get a tetris field.
  function bandsToSquares(picked, scaler, seed = 0) {
    const out = [];
    let n = 0;

    // chunking: more chunks => more "tx squares", but heavier pack.
    // keep this bounded so it stays fast.
    const MAX_SQUARES = 420;
    const MIN_CHUNK_VB = 900; // don't create tiny shards

    for (const band of picked) {
      const vb = Number(band.vbytes) || 0;
      const fee = Number(band.feeRate) || 0;
      if (vb <= 0) continue;

      // decide chunk count proportional to vb
      let chunks = Math.floor(vb / 12_000); // rough: one square per ~12k vB
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
  // State per mount
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
      timer: null,
      rafGuard: false,
    };
  }

  function shouldFetch(st) {
    return (Date.now() - st.lastAt) > 15_000;
  }

  function gridSignature(grid) {
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}`;
  }

  // -----------------------------
  // Render pipeline (modules)
  // -----------------------------
  async function fetchSnapshot(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      // Use TxFetcher but inject ctx so it uses AllOrigins for its internal fetches
      // (txfetcher.js supports ctx.fetchJSON/fetchText)
      const ctx = {
        api: { MEMPOOL },
        fetchJSON: async (url, { signal } = {}) => await aoJSON(url, { signal }),
        fetchText: async (url, { signal } = {}) => await aoText(url, { signal }),
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

    // Seed: stable across same tip + hist
    const seed = (Number(st.lastTip) || 0) ^ (picked.length << 16);

    const squares = bandsToSquares(picked, st.scaler, seed);

    // Pack squares into grid
    const layout = Sorter.packSquares(squares, grid, {
      seed,
      bubblePasses: 1,
    });

    const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
    const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()} · tiles: ${layout.placed.length}`;

    return { layout, meta };
  }

  function paint(root, st) {
    const canvas = ensureCanvasInBlock(root);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = Grid.makeGrid(canvas, {
      minCssH: 220,
      cellCss: 7,  // tweak later
      gapCss:  1,
      padCss:  10
    });

    const sig = gridSignature(grid);
    const gridChanged = (sig !== st.lastGridSig);
    st.lastGridSig = sig;

    const hist = st.lastHist;
    if (!hist) {
      setText(root, "[data-ms-summary]", "mempool data unavailable");
      setText(root, "[data-ms-sub]", "—");
      // blank paint
      Plotter.draw(ctx, canvas, grid, { placed: [] }, "mempool data unavailable");
      return;
    }

    const { layout: newLayout, meta } = buildLayoutFromHistogram(hist, grid, st);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.lastTip ?? "—"} · source: mempool.space (AllOrigins)`);

    // If first render or grid changed, draw hard (no tween)
    if (!st.lastLayout || gridChanged) {
      Plotter.draw(ctx, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    // Animate between last and new
    if (!st.anim) st.anim = new AnimC({ ms: 650 });

    const from = st.lastLayout;
    const to   = newLayout;

    st.anim.play(from, to, (lay /* tweened */, u) => {
      // Lay is { placed:[...] } with float x/y; Plotter expects ints but works fine with floats.
      Plotter.draw(ctx, canvas, grid, lay, meta);
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

    // quick cadence for animation/resize response; fetch throttled separately
    st.timer = setInterval(() => tick(root, st), 850);
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

  function boot(root) {
    if (!root) return;

    if (!havePipeline()) {
      // If modules aren’t loaded yet, fail-soft with a clear message.
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", "ensure txfetcher/scaler/themes/grid/sorter/plotter/animation are loaded");
      return;
    }

    if (!root.__zzxMempoolSpecsState) root.__zzxMempoolSpecsState = makeState();
    const st = root.__zzxMempoolSpecsState;

    if (!st.scaler) st.scaler = new ScalerC();

    // ensure canvas exists
    ensureCanvasInBlock(root);

    start(root, st);
  }

  // -----------------------------
  // Core mount hooks
  // -----------------------------
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }

  if (W.__ZZX_WIDGETS && typeof W.__ZZX_WIDGETS.register === "function") {
    try { W.__ZZX_WIDGETS.register(ID, function (root) { boot(root); }); } catch (_) {}
  }

})();
