// __partials/widgets/mempool-specs/widget.js
// DROP-IN REPLACEMENT (core-compatible) — mempool-specs
// - Works with widget-core.js (ZZXWidgetsCore.onMount / ZZXWidgets.register)
// - Uses AllOrigins RAW to fetch mempool.space reliably
// - DPR-aware canvas sizing
// - Throttled network + stable deterministic tile rendering
// - Uses ZZXTheme if present, else fallback palette
//
// This is the "block/0 fill" visual precursor. Your full tetris/bin-fill system
// (txfetcher/scaler/themes/grid/plotter/sorter/animation) can replace drawStableTiles later.

(function () {
  "use strict";

  const W = window;

  const ID = "mempool-specs";
  const MEMPOOL = "https://mempool.space/api";
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  function makeState() {
    return {
      inflight: false,
      lastFetchAt: 0,
      lastTipHeight: null,
      lastHist: null,

      // resize tracking
      lastCssW: 0,
      lastCssH: 0,
    };
  }

  function bySel(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  function aoUrl(u) {
    return AO_RAW + encodeURIComponent(String(u));
  }

  async function jget(u) {
    const r = await fetch(aoUrl(u), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function tget(u) {
    const r = await fetch(aoUrl(u), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

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
      picked.push({ fee, vsize: take });
      used += take;
    }
    return { picked, used, targetVSize };
  }

  function toTiers(picked, tierCount) {
    if (!picked.length) return [];
    const fees = picked.map((x) => x.fee);
    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    const span = (maxFee - minFee) || 1;

    const tiers = Array.from({ length: tierCount }, () => ({ w: 0 }));
    for (const x of picked) {
      const t = Math.max(
        0,
        Math.min(tierCount - 1, Math.floor(((x.fee - minFee) / span) * tierCount))
      );
      tiers[t].w += x.vsize;
    }
    return tiers.map((t, i) => ({ idx: i, w: t.w })).filter((t) => t.w > 0);
  }

  function ensureCanvasSized(canvas, st) {
    const dpr = W.devicePixelRatio || 1;

    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 220));

    if (cssW === st.lastCssW && cssH === st.lastCssH) return false;
    st.lastCssW = cssW;
    st.lastCssH = cssH;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    return true;
  }

  function drawStableTiles(canvas, tiers, seed, metaText) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const theme =
      W.ZZXTheme?.widgets?.mempoolSpecs ||
      W.ZZXTheme?.widgets?.mempoolGoggles ||
      {};

    const palette = Array.isArray(theme.tiers) && theme.tiers.length
      ? theme.tiers
      : ["#0b3d2e", "#0f5a3f", "#12724f", "#168a61", "#1aa374", "#6aa92a", "#b6a11c"];

    const bg = theme.canvasBg || "#000";
    const grid = theme.gridLine || "rgba(255,255,255,0.06)";
    const tile = Number.isFinite(theme.tileSize) ? theme.tileSize : 5;
    const gap  = Number.isFinite(theme.tileGap)  ? theme.tileGap  : 1;

    const CW = canvas.width;
    const CH = canvas.height;

    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // subtle grid
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let y = 0; y <= CH; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CW, y + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x <= CW; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CH);
      ctx.stroke();
    }

    const total = tiers.reduce((a, t) => a + t.w, 0) || 1;
    const rnd = mulberry32(seed);

    // low fee left, high fee right
    let x0 = 0;
    const ordered = tiers.slice().sort((a, b) => a.idx - b.idx);

    for (let i = 0; i < ordered.length; i++) {
      const stripW = Math.max(tile * 10, Math.round((ordered[i].w / total) * CW));
      const x1 = (i === ordered.length - 1) ? CW : Math.min(CW, x0 + stripW);

      const pIdx = Math.round((i / Math.max(1, ordered.length - 1)) * (palette.length - 1));
      ctx.fillStyle = palette[Math.min(palette.length - 1, Math.max(0, pIdx))];

      const density = 0.62 + (i / Math.max(1, ordered.length - 1)) * 0.30;

      for (let y = 0; y < CH; y += (tile + gap)) {
        for (let x = x0; x < x1; x += (tile + gap)) {
          if (rnd() > density) continue;
          ctx.fillRect(x, y, tile, tile);
        }
      }

      x0 = x1;
      if (x0 >= CW) break;
    }

    if (metaText) {
      ctx.save();
      // Local font family name (must be defined by your local fonts.css)
      ctx.font = "12px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillStyle = "rgba(192,214,116,0.85)";
      ctx.fillText(metaText, 10, CH - 14);
      ctx.restore();
    }
  }

  async function fetchSnapshot(st) {
    if (st.inflight) return;
    st.inflight = true;

    try {
      let tipHeight = null;
      try {
        const htxt = await tget(`${MEMPOOL}/blocks/tip/height`);
        const h = parseInt(String(htxt).trim(), 10);
        if (Number.isFinite(h)) tipHeight = h;
      } catch (_) {}

      const mem = await jget(`${MEMPOOL}/mempool`);
      const hist = mem?.fee_histogram || null;

      st.lastTipHeight = tipHeight;
      st.lastHist = hist;
      st.lastFetchAt = Date.now();
    } finally {
      st.inflight = false;
    }
  }

  function shouldFetch(st) {
    return (Date.now() - st.lastFetchAt) > 15_000;
  }

  function findCanvas(root) {
    return (
      bySel(root, 'canvas[data-canvas]') ||
      bySel(root, ".mempool-specs canvas") ||
      bySel(root, ".ms-block canvas") ||
      bySel(root, ".btc-goggles canvas") || // tolerate older HTML during migration
      bySel(root, "canvas") ||
      null
    );
  }

  function findMeta(root) {
    return (
      bySel(root, "[data-meta]") ||
      bySel(root, "[data-ms-meta]") ||
      bySel(root, ".zzx-card__sub") ||
      null
    );
  }

  async function render(root, st) {
    if (!root || !root.isConnected) return;

    const canvas = findCanvas(root);
    const metaEl = findMeta(root);
    if (!canvas) return;

    ensureCanvasSized(canvas, st);

    const hist = st.lastHist;
    if (!hist) {
      if (metaEl) metaEl.textContent = "mempool data unavailable";
      return;
    }

    const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);

    const paletteLen =
      (W.ZZXTheme?.widgets?.mempoolSpecs?.tiers?.length) ||
      (W.ZZXTheme?.widgets?.mempoolGoggles?.tiers?.length) ||
      7;

    const tiers = toTiers(picked, paletteLen);

    const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
    const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()}`;
    if (metaEl) metaEl.textContent = meta;

    const snapshot = JSON.stringify((Array.isArray(hist) ? hist.slice(0, 50) : []));
    const seed = fnv1a32(`${st.lastTipHeight || "x"}|${snapshot}`);

    drawStableTiles(canvas, tiers, seed, meta);
  }

  function startLoop(root, st) {
    if (root.__zzxMempoolSpecsTimer) {
      clearInterval(root.__zzxMempoolSpecsTimer);
      root.__zzxMempoolSpecsTimer = null;
    }

    const tick = async () => {
      try {
        if (shouldFetch(st)) await fetchSnapshot(st);
        await render(root, st);
      } catch (e) {
        if (DEBUG) console.warn("[ZZX:MEMPOOL-SPECS] tick failed", e);
      }
    };

    tick();
    root.__zzxMempoolSpecsTimer = setInterval(tick, 750);
  }

  function boot(root) {
    if (!root) return;

    if (!root.__zzxMempoolSpecsState) root.__zzxMempoolSpecsState = makeState();
    const st = root.__zzxMempoolSpecsState;

    startLoop(root, st);

    if (!root.__zzxMempoolSpecsResizeBound) {
      root.__zzxMempoolSpecsResizeBound = true;
      W.addEventListener("resize", () => {
        try { render(root, st); } catch (_) {}
      });
    }
  }

  // Preferred: core lifecycle
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  }

  // Legacy shim path
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }

  // Ultra-legacy compatibility (won’t break if present)
  if (W.__ZZX_WIDGETS && typeof W.__ZZX_WIDGETS.register === "function") {
    try { W.__ZZX_WIDGETS.register(ID, function (root) { boot(root); }); } catch (_) {}
  }
})();
