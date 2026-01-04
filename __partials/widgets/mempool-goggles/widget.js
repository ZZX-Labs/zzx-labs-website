// __partials/widgets/mempool-goggles/widget.js
// Robust standalone mempool goggles (no dependencies on other widgets)
// - Throttled network
// - Resizes correctly (DPR-aware)
// - Deterministic tile pattern per tip + histogram snapshot
// - Uses ZZXTheme if present, else fallback palette

(function () {
  const NAME = "mempool-goggles";
  const MEMPOOL = "https://mempool.space/api";

  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX:GOGGLES]", ...a);

  const state = {
    roots: new Set(),
    lastFetchAt: 0,
    inflight: false,
    lastTipHeight: null,
    lastHist: null,
    lastSeed: null,
    lastDrawAt: 0,
    // for resize detection
    lastCssW: 0,
    lastCssH: 0,
  };

  function bySel(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  async function jget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }

  async function tget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
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
    const fees = picked.map(x => x.fee);
    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    const span = (maxFee - minFee) || 1;

    const tiers = Array.from({ length: tierCount }, () => ({ w: 0 }));
    for (const x of picked) {
      const t = Math.max(0, Math.min(tierCount - 1, Math.floor(((x.fee - minFee) / span) * tierCount)));
      tiers[t].w += x.vsize;
    }
    return tiers.map((t, i) => ({ idx: i, w: t.w })).filter(t => t.w > 0);
  }

  function ensureCanvasSized(canvas) {
    // Size canvas to CSS box * DPR, but only when needed
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 220));

    if (cssW === state.lastCssW && cssH === state.lastCssH) return false;
    state.lastCssW = cssW;
    state.lastCssH = cssH;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    return true;
  }

  function drawStableTiles(canvas, tiers, seed, metaText) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const theme = window.ZZXTheme?.widgets?.mempoolGoggles || {};
    const palette = Array.isArray(theme.tiers) && theme.tiers.length
      ? theme.tiers
      : ["#0b3d2e", "#0f5a3f", "#12724f", "#168a61", "#1aa374", "#6aa92a", "#b6a11c"];

    const bg = theme.canvasBg || "#000";
    const grid = theme.gridLine || "rgba(255,255,255,0.06)";
    const tile = Number.isFinite(theme.tileSize) ? theme.tileSize : 5;
    const gap  = Number.isFinite(theme.tileGap)  ? theme.tileGap  : 1;

    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // subtle grid
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    for (let x = 0; x <= W; x += 44) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }

    const total = tiers.reduce((a, t) => a + t.w, 0) || 1;
    const rnd = mulberry32(seed);

    // low fee left, high fee right
    let x0 = 0;
    const ordered = tiers.slice().sort((a, b) => a.idx - b.idx);

    for (let i = 0; i < ordered.length; i++) {
      const stripW = Math.max(tile * 10, Math.round((ordered[i].w / total) * W));
      const x1 = (i === ordered.length - 1) ? W : Math.min(W, x0 + stripW);

      const pIdx = Math.round((i / Math.max(1, ordered.length - 1)) * (palette.length - 1));
      ctx.fillStyle = palette[Math.min(palette.length - 1, Math.max(0, pIdx))];

      // density: increase slightly with fee band
      const density = 0.62 + (i / Math.max(1, ordered.length - 1)) * 0.30;

      for (let y = 0; y < H; y += (tile + gap)) {
        for (let x = x0; x < x1; x += (tile + gap)) {
          if (rnd() > density) continue;
          ctx.fillRect(x, y, tile, tile);
        }
      }

      x0 = x1;
      if (x0 >= W) break;
    }

    if (metaText) {
      ctx.save();
      ctx.font = `${Math.max(12, Math.floor(11 * (window.devicePixelRatio || 1)))}px IBMPlexMono, ui-monospace, monospace`;
      ctx.fillStyle = "rgba(192,214,116,0.85)";
      ctx.fillText(metaText, 10, H - 14);
      ctx.restore();
    }
  }

  async function fetchSnapshot() {
    if (state.inflight) return;
    state.inflight = true;

    try {
      let tipHeight = null;
      try {
        const htxt = await tget(`${MEMPOOL}/blocks/tip/height`);
        const h = parseInt(String(htxt).trim(), 10);
        if (Number.isFinite(h)) tipHeight = h;
      } catch {}

      const mem = await jget(`${MEMPOOL}/mempool`);
      const hist = mem?.fee_histogram || null;

      state.lastTipHeight = tipHeight;
      state.lastHist = hist;
      state.lastFetchAt = Date.now();
    } finally {
      state.inflight = false;
    }
  }

  function renderAll() {
    for (const root of state.roots) {
      if (!root.isConnected) continue;

      const canvas = bySel(root, "canvas[data-canvas]");
      const metaEl = bySel(root, "[data-meta]");
      if (!canvas) continue;

      ensureCanvasSized(canvas);

      const hist = state.lastHist;
      if (!hist) {
        if (metaEl) metaEl.textContent = "mempool data unavailable";
        continue;
      }

      const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);
      const paletteLen = (window.ZZXTheme?.widgets?.mempoolGoggles?.tiers?.length) || 7;
      const tiers = toTiers(picked, paletteLen);

      const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
      const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()}`;

      if (metaEl) metaEl.textContent = meta;

      const snapshot = JSON.stringify((Array.isArray(hist) ? hist.slice(0, 50) : []));
      const seed = fnv1a32(`${state.lastTipHeight || "x"}|${snapshot}`);
      state.lastSeed = seed;

      drawStableTiles(canvas, tiers, seed, meta);
      state.lastDrawAt = Date.now();
    }
  }

  function shouldFetch() {
    const now = Date.now();
    // 15s fetch cadence is plenty; draw can happen more often without refetch.
    return (now - state.lastFetchAt) > 15_000;
  }

  window.__ZZX_WIDGETS?.register({
    name: NAME,

    bind(root) {
      state.roots.add(root);

      // Immediate paint attempt (won’t draw until we have data)
      try { renderAll(); } catch {}
    },

    async tick() {
      // Clean roots
      for (const r of Array.from(state.roots)) if (!r.isConnected) state.roots.delete(r);

      if (!state.roots.size) return;

      // Refetch occasionally
      if (shouldFetch()) {
        try {
          await fetchSnapshot();
        } catch (e) {
          if (DEBUG) console.warn("[ZZX:GOGGLES] fetch failed", e);
        }
      }

      // Re-render if resized or if we have fresh data
      try { renderAll(); } catch (e) {
        if (DEBUG) console.warn("[ZZX:GOGGLES] render failed", e);
      }
    }
  });
})();
