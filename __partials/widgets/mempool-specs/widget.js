// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT
//
// Goal: mempool.space "goggles-like" field:
// - many tiles, heavy-tailed sizes (few big, lots tiny)
// - feeRate -> color via themes.js
// - pack via Sorter.packSquares (tetris scan), NOT treemap columns
// - animate via Anim
//
// Data strategy (low-call):
// 1) Prefer /api/v1/fees/mempool-blocks (gives feeRange + blockVSize + nTx)
//    -> synthesize tx tiles per projected block with realistic size distribution.
// 2) Fallback to /api/mempool fee_histogram
//
// Requires sibling modules in same dir:
// fetch.js, themes.js, grid.js, sorter.js, scaler.js, plotter.js, animation.js
// (txfetcher.js optional; used only for tip height if present)
(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const MEMPOOL_BASE = "https://mempool.space/api";
  const EP = {
    tipHeight: `${MEMPOOL_BASE}/blocks/tip/height`,
    mempool:   `${MEMPOOL_BASE}/mempool`,
    blocks:    `${MEMPOOL_BASE}/v1/fees/mempool-blocks`,
  };

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
  // Dependency auto-loader (fail-loud)
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

  async function ensureDeps() {
    const base = widgetBasePath();
    const deps = [
      ["fetch.js",     "zzx:ms:fetch",   () => !!W.ZZXMempoolSpecsFetch?.fetchJSON],
      ["themes.js",    "zzx:ms:themes",  () => !!W.ZZXMempoolSpecs?.Theme],
      ["grid.js",      "zzx:ms:grid",    () => !!W.ZZXMempoolSpecs?.Grid],
      ["sorter.js",    "zzx:ms:sorter",  () => !!W.ZZXMempoolSpecs?.Sorter?.packSquares],
      ["scaler.js",    "zzx:ms:scaler",  () => !!W.ZZXMempoolSpecs?.Scaler],
      ["plotter.js",   "zzx:ms:plotter", () => !!W.ZZXMempoolSpecs?.Plotter?.draw],
      ["animation.js", "zzx:ms:anim",    () => !!W.ZZXMempoolSpecs?.Anim?.Anim],
      // txfetcher.js is optional (tip height); widget works without it
      ["txfetcher.js", "zzx:ms:txf",     () => true],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} failed to load (${base}${file})` };
      await new Promise(r => setTimeout(r, 0));
      // for non-optional modules, verify again:
      if (file !== "txfetcher.js" && !okfn()) return { ok: false, why: `${file} loaded but did not register` };
    }
    return { ok: true };
  }

  function havePipeline() {
    const NS = W.ZZXMempoolSpecs;
    return !!(
      W.ZZXMempoolSpecsFetch?.fetchJSON &&
      NS?.Theme &&
      NS?.Grid &&
      NS?.Sorter?.packSquares &&
      NS?.Scaler &&
      NS?.Plotter?.draw &&
      NS?.Anim?.Anim
    );
  }

  // -----------------------------
  // RNG helpers (seeded, deterministic-ish)
  // -----------------------------
  function xorshift32(seed) {
    let x = (seed >>> 0) || 0x12345678;
    return function rand() {
      // xorshift32
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17; x >>>= 0;
      x ^= x << 5;  x >>>= 0;
      return (x >>> 0) / 0x100000000;
    };
  }

  // lognormal-ish sample (cheap)
  function sampleLogNormal(rand, mu, sigma) {
    // Box-Muller normal -> exp
    const u1 = Math.max(1e-9, rand());
    const u2 = Math.max(1e-9, rand());
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // -----------------------------
  // Data fetch
  // -----------------------------
  async function fetchJSON(url, { signal } = {}) {
    const r = await W.ZZXMempoolSpecsFetch.fetchJSON(url, { signal });
    return r.json;
  }

  async function fetchText(url, { signal } = {}) {
    const r = await W.ZZXMempoolSpecsFetch.fetchText(url, { signal });
    return r.text;
  }

  // Prefer /v1/fees/mempool-blocks if present
  async function loadMempoolBlocks(st) {
    try {
      const blocks = await fetchJSON(EP.blocks);
      if (Array.isArray(blocks) && blocks.length) return blocks;
    } catch (_) {}
    return null;
  }

  async function loadHistogram(st) {
    try {
      const mem = await fetchJSON(EP.mempool);
      if (mem && Array.isArray(mem.fee_histogram) && mem.fee_histogram.length) return mem.fee_histogram;
    } catch (_) {}
    return null;
  }

  async function loadTipHeight(st) {
    // Use txfetcher if it exists, otherwise use direct height endpoint
    try {
      if (W.ZZXMempoolSpecs?.TxFetcher) {
        if (!st._txf) st._txf = new W.ZZXMempoolSpecs.TxFetcher({ base: MEMPOOL_BASE, minIntervalMs: 15_000 });
        const snap = await st._txf.snapshot({ force: true });
        if (snap?.tipHeight != null) return snap.tipHeight;
      }
    } catch (_) {}
    try {
      const t = await fetchText(EP.tipHeight);
      const n = parseInt(String(t).trim(), 10);
      if (Number.isFinite(n)) return n;
    } catch (_) {}
    return null;
  }

  // -----------------------------
  // Tile synthesis (GOGGLES-LIKE)
  // -----------------------------
  function synthFromMempoolBlocks(blocks, scaler, seedBase) {
    // blocks[] typical shape (best-effort):
    // { blockVSize|blockSize, nTx, feeRange:[min,max] or array, medianFee? }
    //
    // We will synthesize many tx tiles with:
    // - vbytes distributed lognormally around mean = blockVSize/nTx
    // - feeRate sampled within feeRange (biased upward for earlier blocks)
    //
    // Cap total tiles for performance on mobile.
    const MAX_TILES = 1800;

    const out = [];
    let tileId = 0;

    // seed ties to tip + block count so it stays stable between refreshes
    const rand = xorshift32((seedBase >>> 0) ^ (blocks.length << 8) ^ 0xA5A5A5A5);

    // earlier blocks are higher fee, so bias fee samples upward for index=0
    for (let bi = 0; bi < blocks.length; bi++) {
      if (out.length >= MAX_TILES) break;

      const b = blocks[bi] || {};
      const nTx = Math.max(0, Math.floor(Number(b.nTx ?? b.ntx ?? 0)));
      const vsize = Number(b.blockVSize ?? b.blockSize ?? b.block_vsize ?? 0);

      if (!Number.isFinite(nTx) || !Number.isFinite(vsize) || nTx <= 0 || vsize <= 0) continue;

      // fee range: could be [a,b] or long array; normalize to min/max
      let fr = b.feeRange ?? b.fee_range ?? null;
      let fMin = 1, fMax = 2;
      if (Array.isArray(fr) && fr.length >= 2) {
        const nums = fr.map(Number).filter(Number.isFinite);
        if (nums.length) {
          fMin = Math.min(...nums);
          fMax = Math.max(...nums);
        }
      }

      fMin = Number.isFinite(fMin) ? fMin : 1;
      fMax = Number.isFinite(fMax) ? fMax : (fMin + 10);

      const mean = vsize / nTx;                 // mean vB
      const sigma = 0.95;                       // heavy tail
      const mu = Math.log(Math.max(60, mean)) - 0.5 * sigma * sigma;

      // how many tiles from this block? keep density but cap
      const tilesHere = clamp(Math.floor(nTx * 0.55), 80, 520);

      // fee bias: earlier blocks push toward high end
      const bias = clamp(1.25 - (bi * 0.18), 0.55, 1.25);

      let usedVb = 0;
      const targetVb = vsize;

      for (let i = 0; i < tilesHere; i++) {
        if (out.length >= MAX_TILES) break;

        // sample vbytes; clamp to keep extremes sane
        let vb = sampleLogNormal(rand, mu, sigma);
        vb = clamp(vb, 60, 80_000);

        // scale vb so total roughly matches block vsize
        // do a soft stop if we run out of vbytes budget
        if (usedVb >= targetVb) break;
        vb = Math.min(vb, targetVb - usedVb);
        if (vb < 40) break;
        usedVb += vb;

        // sample feeRate within range, biased
        const u = Math.pow(rand(), bias);
        const feeRate = fMin + (fMax - fMin) * u;

        const side = scaler.sideCellsFromVBytes(vb);

        out.push({
          txid: `b${bi}:${seedBase}:${tileId++}`,
          feeRate,
          vbytes: vb,
          side
        });
      }
    }

    return out;
  }

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

  function synthFromHistogram(hist, scaler, seedBase) {
    // Turn fee bands into many tx-like tiles with a heavy tail.
    const { picked } = computeNextBlockFromHistogram(hist, 1_000_000);

    const MAX_TILES = 1600;
    const out = [];
    let id = 0;

    const rand = xorshift32((seedBase >>> 0) ^ (picked.length << 16) ^ 0x5C3A21D7);

    for (const band of picked) {
      if (out.length >= MAX_TILES) break;

      const fee = Number(band.feeRate) || 0;
      let vb = Number(band.vbytes) || 0;
      if (vb <= 0) continue;

      // Create a few large tiles + many small tiles per band
      // Big tiles capture "whales" / CPFP clusters feel.
      const bigCount = clamp(Math.floor(vb / 180_000), 0, 6);
      for (let i = 0; i < bigCount; i++) {
        if (out.length >= MAX_TILES) break;
        const take = clamp(vb * (0.12 + rand() * 0.10), 45_000, 210_000);
        vb -= take;
        out.push({ txid: `h:${fee}:${seedBase}:${id++}`, feeRate: fee, vbytes: take, side: scaler.sideCellsFromVBytes(take) });
      }

      // Then many small/medium tiles with lognormal spread
      const mean = clamp(vb / 220, 80, 4000);
      const sigma = 1.05;
      const mu = Math.log(mean) - 0.5 * sigma * sigma;

      const tiles = clamp(Math.floor(vb / 1200), 40, 360);
      let used = 0;

      for (let i = 0; i < tiles; i++) {
        if (out.length >= MAX_TILES) break;
        if (used >= vb) break;

        let t = sampleLogNormal(rand, mu, sigma);
        t = clamp(t, 60, 60_000);

        t = Math.min(t, vb - used);
        if (t < 40) break;
        used += t;

        out.push({
          txid: `h:${fee}:${seedBase}:${id++}`,
          feeRate: fee,
          vbytes: t,
          side: scaler.sideCellsFromVBytes(t)
        });
      }
    }

    return out;
  }

  // -----------------------------
  // State + loop
  // -----------------------------
  function makeState() {
    return {
      scaler: null,
      anim: null,
      timer: null,

      lastAt: 0,
      tip: null,

      blocks: null,
      hist: null,

      lastLayout: null,
      lastGridSig: "",
      inflight: false,
      _txf: null
    };
  }

  function gridSignature(grid) {
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}`;
  }

  function shouldFetch(st) {
    return (Date.now() - st.lastAt) > 15_000;
  }

  async function refreshData(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      st.tip = await loadTipHeight(st);

      // prefer mempool-blocks
      const blocks = await loadMempoolBlocks(st);
      if (blocks) {
        st.blocks = blocks;
        st.hist = null;
      } else {
        st.blocks = null;
        st.hist = await loadHistogram(st);
      }

      st.lastAt = Date.now();
    } finally {
      st.inflight = false;
    }
  }

  function buildLayout(st, grid) {
    const NS = W.ZZXMempoolSpecs;

    const seedBase = (Number(st.tip) || 0) ^ (grid.cols << 10) ^ (grid.rows << 20);

    let items = [];
    let source = "";

    if (Array.isArray(st.blocks) && st.blocks.length) {
      items = synthFromMempoolBlocks(st.blocks, st.scaler, seedBase);
      source = "mempool-blocks";
    } else if (Array.isArray(st.hist) && st.hist.length) {
      items = synthFromHistogram(st.hist, st.scaler, seedBase);
      source = "fee_histogram";
    } else {
      return { layout: { placed: [] }, meta: "mempool data unavailable", source: "none" };
    }

    // Pack using YOUR tetris scan packer (not treemap)
    const layout = NS.Sorter.packSquares(items, grid, {
      seed: seedBase,
      bubblePasses: 1
    });

    const tiles = layout.placed.length;
    const meta = `block/0 fill: ${tiles ? "≈" : "0"} · tiles: ${tiles.toLocaleString()} · source: ${source}`;
    return { layout, meta, source };
  }

  function paint(root, st) {
    const NS = W.ZZXMempoolSpecs;

    const canvas = ensureCanvas(root);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = NS.Grid.makeGrid(canvas, {
      minCssH: 220,
      cellCss: 6.5,   // smaller cells => more tiles visible (closer to goggles)
      gapCss:  1,
      padCss:  10
    });

    const sig = gridSignature(grid);
    const gridChanged = (sig !== st.lastGridSig);
    st.lastGridSig = sig;

    const { layout: newLayout, meta, source } = buildLayout(st, grid);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.tip ?? "—"} · mempool.space`);

    if (!st.lastLayout || gridChanged) {
      NS.Plotter.draw(ctx, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    if (!st.anim) st.anim = new NS.Anim.Anim({ ms: 750 });

    st.anim.play(st.lastLayout, newLayout, (lay) => {
      NS.Plotter.draw(ctx, canvas, grid, lay, meta);
    });

    st.lastLayout = newLayout;
  }

  async function tick(root, st) {
    if (!root || !root.isConnected) return;

    try {
      if (shouldFetch(st)) await refreshData(st);
      paint(root, st);
    } catch (e) {
      const msg = String(e?.message || e);
      setText(root, "[data-ms-sub]", `error: ${msg}`);
      if (DEBUG) console.warn("[ZZX:MEMPOOL-SPECS] tick failed", e);
    }
  }

  function start(root, st) {
    if (st.timer) clearInterval(st.timer);

    // paint cadence; network fetch throttled separately
    st.timer = setInterval(() => tick(root, st), 950);
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

  async function boot(root) {
    if (!root) return;

    if (root.__zzxMempoolSpecsState) stop(root.__zzxMempoolSpecsState);
    else root.__zzxMempoolSpecsState = makeState();

    setText(root, "[data-ms-summary]", "loading…");
    setText(root, "[data-ms-sub]", "loading modules…");

    ensureCanvas(root);

    const deps = await ensureDeps();
    if (!deps.ok) {
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", deps.why);
      return;
    }

    if (!havePipeline()) {
      setText(root, "[data-ms-summary]", "mempool-specs modules missing");
      setText(root, "[data-ms-sub]", "fetch/themes/grid/sorter/scaler/plotter/animation not registered");
      return;
    }

    const st = root.__zzxMempoolSpecsState;
    const NS = W.ZZXMempoolSpecs;
    if (!st.scaler) st.scaler = new NS.Scaler();

    setText(root, "[data-ms-sub]", "loading mempool…");

    start(root, st);
  }

  // register
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  } else if (W.__ZZX_WIDGETS && typeof W.__ZZX_WIDGETS.register === "function") {
    try { W.__ZZX_WIDGETS.register(ID, function (root) { boot(root); }); } catch (_) {}
  } else {
    if (DEBUG) console.warn("[ZZX:MEMPOOL-SPECS] no widget registry found");
  }
})();
