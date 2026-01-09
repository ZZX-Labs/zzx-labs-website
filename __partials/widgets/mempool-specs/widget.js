// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT (FIXED)
//
// What this fixes (vs your current draft):
// - Works with BOTH scaler APIs:
//     * scaler.sideCellsFromVBytes(vb)  (older expectation)
//     * scaler.areaCellsFromVBytes(vb)  (your new scaler.js)
//   → We derive a square side from area when needed.
// - Does NOT rely on the treemap sorter (which produces w/h rectangles / “columns” look).
//   Instead, it packs TRUE SQUARE tiles via a deterministic scanline square packer
//   (mempool “goggles-like”).
// - Keeps your low-call data strategy:
//     1) /api/v1/fees/mempool-blocks (preferred)
//     2) /api/mempool fee_histogram (fallback)
// - Uses themes.js for feeRate → color.
// - Uses animation.js if present; otherwise draws immediate frames.
//
// Requires sibling modules in same dir:
// fetch.js, themes.js, grid.js, scaler.js, plotter.js
// animation.js optional but recommended
// txfetcher.js optional (tip height)
//
// Notes:
// - This synthesizes tiles (because APIs don’t expose every mempool tx without heavy calls).
// - Click overlays (tx-card.js) will be wired in renderer.js later.

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
    c.style.width = "100%";
    c.style.height = "100%";
    host.appendChild(c);
    return c;
  }

  // -----------------------------
  // Dependency loader (fail-loud)
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

    // NOTE: sorter.js is intentionally NOT required here,
    // because we pack squares locally to avoid treemap columns.
    const deps = [
      ["fetch.js",     "zzx:ms:fetch",   () => !!W.ZZXMempoolSpecsFetch?.fetchJSON],
      ["themes.js",    "zzx:ms:themes",  () => !!W.ZZXMempoolSpecs?.Theme],
      ["grid.js",      "zzx:ms:grid",    () => !!W.ZZXMempoolSpecs?.Grid?.makeGrid],
      ["scaler.js",    "zzx:ms:scaler",  () => !!W.ZZXMempoolSpecs?.Scaler],
      ["plotter.js",   "zzx:ms:plotter", () => !!W.ZZXMempoolSpecs?.Plotter?.draw],
      ["animation.js", "zzx:ms:anim",    () => true], // optional
      ["txfetcher.js", "zzx:ms:txf",     () => true], // optional
      ["sources.js",   "zzx:ms:sources", () => true], // optional
      ["adapter.js",   "zzx:ms:adapter", () => true], // optional
      ["tx-card.js",   "zzx:ms:txcard",  () => true], // optional (wired later)
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} failed to load (${base}${file})` };
      await new Promise(r => setTimeout(r, 0));
      if (["fetch.js","themes.js","grid.js","scaler.js","plotter.js"].includes(file) && !okfn()) {
        return { ok: false, why: `${file} loaded but did not register` };
      }
    }
    return { ok: true };
  }

  function havePipeline() {
    const NS = W.ZZXMempoolSpecs;
    return !!(
      W.ZZXMempoolSpecsFetch?.fetchJSON &&
      NS?.Theme &&
      NS?.Grid?.makeGrid &&
      NS?.Scaler &&
      NS?.Plotter?.draw
    );
  }

  // -----------------------------
  // RNG helpers (seeded)
  // -----------------------------
  function xorshift32(seed) {
    let x = (seed >>> 0) || 0x12345678;
    return function rand() {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17; x >>>= 0;
      x ^= x << 5;  x >>>= 0;
      return (x >>> 0) / 0x100000000;
    };
  }

  function sampleLogNormal(rand, mu, sigma) {
    const u1 = Math.max(1e-9, rand());
    const u2 = Math.max(1e-9, rand());
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // -----------------------------
  // Fetch wrappers
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
  async function loadMempoolBlocks() {
    try {
      const blocks = await fetchJSON(EP.blocks);
      if (Array.isArray(blocks) && blocks.length) return blocks;
    } catch (_) {}
    return null;
  }

  async function loadHistogram() {
    try {
      const mem = await fetchJSON(EP.mempool);
      if (mem && Array.isArray(mem.fee_histogram) && mem.fee_histogram.length) return mem.fee_histogram;
    } catch (_) {}
    return null;
  }

  async function loadTipHeight(st) {
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
  // Scaler compat: derive square side
  // -----------------------------
  function sideFromVBytes(scaler, vb) {
    // Preferred old API
    if (scaler && typeof scaler.sideCellsFromVBytes === "function") {
      const s = Number(scaler.sideCellsFromVBytes(vb));
      if (Number.isFinite(s) && s > 0) return Math.max(1, Math.round(s));
    }
    // New API: area -> side
    if (scaler && typeof scaler.areaCellsFromVBytes === "function") {
      const a = Number(scaler.areaCellsFromVBytes(vb));
      if (Number.isFinite(a) && a > 0) return Math.max(1, Math.ceil(Math.sqrt(a)));
    }
    // Fallback heuristic
    const v = Number(vb);
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.max(1, Math.ceil(Math.sqrt(v / 1200)));
  }

  // -----------------------------
  // GOGGLES-LIKE tile synthesis
  // -----------------------------
  function synthFromMempoolBlocks(blocks, scaler, seedBase) {
    const MAX_TILES = 1800;
    const out = [];
    let tileId = 0;

    const rand = xorshift32((seedBase >>> 0) ^ (blocks.length << 8) ^ 0xA5A5A5A5);

    for (let bi = 0; bi < blocks.length; bi++) {
      if (out.length >= MAX_TILES) break;

      const b = blocks[bi] || {};
      const nTx = Math.max(0, Math.floor(Number(b.nTx ?? b.ntx ?? 0)));
      const vsize = Number(b.blockVSize ?? b.blockSize ?? b.block_vsize ?? 0);
      if (!Number.isFinite(nTx) || !Number.isFinite(vsize) || nTx <= 0 || vsize <= 0) continue;

      let fr = b.feeRange ?? b.fee_range ?? null;
      let fMin = 1, fMax = 2;

      if (Array.isArray(fr) && fr.length >= 2) {
        const nums = fr.map(Number).filter(Number.isFinite);
        if (nums.length) { fMin = Math.min(...nums); fMax = Math.max(...nums); }
      }
      fMin = Number.isFinite(fMin) ? fMin : 1;
      fMax = Number.isFinite(fMax) ? fMax : (fMin + 10);

      const mean = vsize / nTx;
      const sigma = 0.95;
      const mu = Math.log(Math.max(60, mean)) - 0.5 * sigma * sigma;

      const tilesHere = clamp(Math.floor(nTx * 0.55), 80, 520);

      // earlier blocks bias to higher fee
      const bias = clamp(1.25 - (bi * 0.18), 0.55, 1.25);

      let usedVb = 0;
      const targetVb = vsize;

      for (let i = 0; i < tilesHere; i++) {
        if (out.length >= MAX_TILES) break;

        let vb = sampleLogNormal(rand, mu, sigma);
        vb = clamp(vb, 60, 80_000);

        if (usedVb >= targetVb) break;
        vb = Math.min(vb, targetVb - usedVb);
        if (vb < 40) break;
        usedVb += vb;

        const u = Math.pow(rand(), bias);
        const feeRate = fMin + (fMax - fMin) * u;

        const side = sideFromVBytes(scaler, vb);

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

      // few big tiles
      const bigCount = clamp(Math.floor(vb / 180_000), 0, 6);
      for (let i = 0; i < bigCount; i++) {
        if (out.length >= MAX_TILES) break;
        const take = clamp(vb * (0.12 + rand() * 0.10), 45_000, 210_000);
        vb -= take;

        out.push({
          txid: `h:${fee}:${seedBase}:${id++}`,
          feeRate: fee,
          vbytes: take,
          side: sideFromVBytes(scaler, take)
        });
      }

      // many small/medium tiles
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
          side: sideFromVBytes(scaler, t)
        });
      }
    }

    return out;
  }

  // -----------------------------
  // TRUE SQUARE packer (scanline)
  // - Produces x,y per square; no rectangles; no columns look.
  // - Deterministic with seed.
  // -----------------------------
  function packSquaresScan(items, grid, opts = {}) {
    const cols = grid.cols;
    const rows = grid.rows;

    const maxSquares = Number(opts.maxSquares || 1400);
    const bubblePasses = Number(opts.bubblePasses || 1);

    // Sort: big first, then fee high, deterministic txid tie-break
    const arr = items.slice()
      .filter(it => Number.isFinite(Number(it.side)) && Number(it.side) >= 1)
      .sort((a, b) => {
        const sa = Number(a.side) || 1;
        const sb = Number(b.side) || 1;
        if (sb !== sa) return sb - sa;
        const fa = Number(a.feeRate) || 0;
        const fb = Number(b.feeRate) || 0;
        if (fb !== fa) return fb - fa;
        return String(a.txid || "").localeCompare(String(b.txid || ""));
      })
      .slice(0, maxSquares);

    // occupancy grid (Uint8)
    const occ = new Uint8Array(cols * rows);
    const idx = (x, y) => (y * cols + x);

    function canPlace(x0, y0, s) {
      if (x0 < 0 || y0 < 0 || (x0 + s) > cols || (y0 + s) > rows) return false;
      for (let y = y0; y < y0 + s; y++) {
        const base = y * cols;
        for (let x = x0; x < x0 + s; x++) {
          if (occ[base + x]) return false;
        }
      }
      return true;
    }

    function place(x0, y0, s) {
      for (let y = y0; y < y0 + s; y++) {
        const base = y * cols;
        for (let x = x0; x < x0 + s; x++) {
          occ[base + x] = 1;
        }
      }
    }

    const placed = [];
    const rejected = [];

    // deterministic-ish start offset to avoid “same corner every time”
    const seed = (opts.seed >>> 0) || 0;
    const rand = xorshift32(seed ^ 0xC0FFEE);
    const startX = Math.floor(rand() * Math.min(cols, 9));
    const startY = Math.floor(rand() * Math.min(rows, 7));

    function scanForSpot(s) {
      // serpentine scan starting near (startX,startY)
      for (let pass = 0; pass < 2; pass++) {
        const yStart = pass === 0 ? startY : 0;
        for (let y = yStart; y <= rows - s; y++) {
          const leftToRight = (y % 2) === 0;
          if (leftToRight) {
            const xStart = (pass === 0 && y === yStart) ? startX : 0;
            for (let x = xStart; x <= cols - s; x++) {
              if (canPlace(x, y, s)) return { x, y };
            }
          } else {
            const xStart = (pass === 0 && y === yStart) ? (cols - s - startX) : (cols - s);
            for (let x = xStart; x >= 0; x--) {
              if (canPlace(x, y, s)) return { x, y };
            }
          }
        }
      }
      return null;
    }

    for (const it of arr) {
      const s0 = clamp(Math.round(Number(it.side) || 1), 1, Math.min(cols, rows));

      // If too big, shrink until it fits somewhere.
      let s = s0;
      let spot = null;
      while (s >= 1 && !spot) {
        spot = scanForSpot(s);
        if (!spot) s--;
      }

      if (!spot) {
        rejected.push(it);
        continue;
      }

      place(spot.x, spot.y, s);
      placed.push({ ...it, x: spot.x, y: spot.y, side: s });
    }

    // Bubble pass: attempt to pull squares “up-left” to reduce holes.
    // (Keeps the goggles look tighter without rectangles.)
    for (let p = 0; p < bubblePasses; p++) {
      // Rebuild occupancy fresh, then re-place in order, trying best spot.
      occ.fill(0);
      const newPlaced = [];
      for (const it of placed) {
        const s = clamp(Math.round(Number(it.side) || 1), 1, Math.min(cols, rows));
        const spot = scanForSpot(s) || scanForSpot(1);
        if (!spot) { rejected.push(it); continue; }
        place(spot.x, spot.y, s);
        newPlaced.push({ ...it, x: spot.x, y: spot.y, side: s });
      }
      placed.length = 0;
      placed.push(...newPlaced);
    }

    return { placed, rejected, cols, rows };
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

      const blocks = await loadMempoolBlocks();
      if (blocks) {
        st.blocks = blocks;
        st.hist = null;
      } else {
        st.blocks = null;
        st.hist = await loadHistogram();
      }

      st.lastAt = Date.now();
    } finally {
      st.inflight = false;
    }
  }

  function buildLayout(st, grid) {
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

    const layout = packSquaresScan(items, grid, {
      seed: seedBase,
      bubblePasses: 1,
      maxSquares: 1600
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
      minCssH: 240,
      cellCss: 6.2,   // smaller cells => more tiles visible
      gapCss:  1,
      padCss:  10
    });

    const sig = gridSignature(grid);
    const gridChanged = (sig !== st.lastGridSig);
    st.lastGridSig = sig;

    const { layout: newLayout, meta } = buildLayout(st, grid);

    setText(root, "[data-ms-summary]", meta);
    setText(root, "[data-ms-sub]", `tip: ${st.tip ?? "—"} · mempool.space`);

    // If no animation module or no prior layout, draw directly.
    const AnimNS = NS.Anim;
    const haveAnim = !!(AnimNS && AnimNS.Anim);

    if (!st.lastLayout || gridChanged || !haveAnim) {
      NS.Plotter.draw(ctx, canvas, grid, newLayout, meta);
      st.lastLayout = newLayout;
      return;
    }

    if (!st.anim) st.anim = new AnimNS.Anim({ ms: 750 });

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

    // Paint cadence; network fetch throttled separately
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
    try { st?.anim?.stop?.(); } catch (_) {}
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
      setText(root, "[data-ms-sub]", "fetch/themes/grid/scaler/plotter not registered");
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
