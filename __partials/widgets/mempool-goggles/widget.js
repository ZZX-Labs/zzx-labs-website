(function () {
  window.ZZXWidgets.register("goggles", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="goggles"]');
      this.canvas = this.card?.querySelector("[data-canvas]");
      this.metaEl = this.card?.querySelector("[data-meta]");
      this.cacheTx = new Map(); // txid -> {vsize, fee, status}
      this.lastTip = null;
    },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;

      // --- Theme hook (optional): define window.ZZXTheme.widgets.goggles
      // If absent, defaults apply.
      const theme = () => (window.ZZXTheme?.widgets?.goggles || {});
      const paletteDefault = ["#123b2b","#15513a","#176a49","#178257","#1aa374","#6aa92a","#b6a11c","#e6a42b"];

      // Deterministic hash for stable layout within a block
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

      // vsize → square size class (in pixels)
      function sizeClass(vsize) {
        // tune freely; these give a “small/medium/large” mix
        if (vsize <= 110) return 4;
        if (vsize <= 220) return 6;
        if (vsize <= 450) return 8;
        if (vsize <= 900) return 10;
        if (vsize <= 1500) return 12;
        return 14;
      }

      // First-fit skyline packer (fast, tetris-ish)
      function packTiles(tiles, W, H, gap) {
        // skyline is array of column heights
        const sky = new Array(W).fill(0);
        const placed = [];

        for (const t of tiles) {
          const w = t.sz + gap;
          const h = t.sz + gap;
          let bestX = -1, bestY = Infinity;

          for (let x = 0; x <= W - w; x++) {
            // max height under the tile footprint
            let y = 0;
            for (let k = x; k < x + w; k++) y = Math.max(y, sky[k]);
            if (y + h > H) continue;

            // prefer lowest placement, then leftmost
            if (y < bestY) { bestY = y; bestX = x; }
          }

          if (bestX >= 0) {
            // place and update skyline
            for (let k = bestX; k < bestX + w; k++) sky[k] = bestY + h;
            placed.push({ ...t, x: bestX, y: bestY, w: t.sz, h: t.sz });
          } else {
            // no space left
            break;
          }
        }

        return placed;
      }

      function feeTierColor(feeRate, tiers, palette) {
        if (!Number.isFinite(feeRate)) return palette[0] || "#15513a";
        // tiers ascending
        for (let i = tiers.length - 1; i >= 0; i--) {
          if (feeRate >= tiers[i]) return palette[Math.min(palette.length - 1, i)];
        }
        return palette[0] || "#15513a";
      }

      async function fetchTipHeight() {
        try {
          const htxt = await ctx.util.tget(`${MEMPOOL}/blocks/tip/height`);
          const h = parseInt(String(htxt).trim(), 10);
          return Number.isFinite(h) ? h : null;
        } catch { return null; }
      }

      async function fetchTxids(limit = 250) {
        // mempool/txids can be large; cap ourselves client-side
        try {
          const ids = await ctx.util.jget(`${MEMPOOL}/mempool/txids`);
          if (!Array.isArray(ids)) return [];
          return ids.slice(0, limit).map(String);
        } catch { return []; }
      }

      async function fetchTx(txid) {
        // returns { fee, vsize, status? }
        try {
          const tx = await ctx.util.jget(`${MEMPOOL}/tx/${txid}`);
          const vsize = Number(tx?.vsize ?? tx?.weight ? (Number(tx.weight)/4) : NaN);
          const fee = Number(tx?.fee);
          const status = tx?.status || null;
          if (!Number.isFinite(vsize)) return null;
          return { txid, vsize, fee: Number.isFinite(fee) ? fee : NaN, status };
        } catch { return null; }
      }

      function draw(canvas, placed, seedMeta) {
        const ctx2 = canvas.getContext("2d");
        if (!ctx2) return;

        const th = theme();
        const palette = Array.isArray(th.palette) && th.palette.length ? th.palette : paletteDefault;
        const bg = th.bg || "#000";
        const grid = th.grid || "rgba(255,255,255,0.06)";
        const gap = Number.isFinite(th.gap) ? th.gap : 1;

        const tiers = Array.isArray(th.feeTiers) && th.feeTiers.length
          ? th.feeTiers.map(Number).filter(Number.isFinite)
          : [1, 3, 5, 10, 20, 40, 80, 150];

        // background
        ctx2.clearRect(0,0,canvas.width,canvas.height);
        ctx2.fillStyle = bg;
        ctx2.fillRect(0,0,canvas.width,canvas.height);

        // subtle grid
        ctx2.strokeStyle = grid;
        ctx2.lineWidth = 1;
        for (let y = 0; y <= canvas.height; y += 22) { ctx2.beginPath(); ctx2.moveTo(0, y+0.5); ctx2.lineTo(canvas.width, y+0.5); ctx2.stroke(); }
        for (let x = 0; x <= canvas.width; x += 32) { ctx2.beginPath(); ctx2.moveTo(x+0.5, 0); ctx2.lineTo(x+0.5, canvas.height); ctx2.stroke(); }

        // tiles
        for (const p of placed) {
          const feeRate = (Number.isFinite(p.fee) && Number.isFinite(p.vsize) && p.vsize > 0) ? (p.fee / p.vsize) : NaN;
          ctx2.fillStyle = feeTierColor(feeRate, tiers, palette);
          ctx2.fillRect(p.x, p.y, p.w, p.h);
        }

        // label (optional)
        if (th.label !== false) {
          ctx2.save();
          ctx2.font = "12px IBMPlexMono, ui-monospace, monospace";
          ctx2.fillStyle = "rgba(192,214,116,0.85)";
          ctx2.fillText(seedMeta || "block/0", 8, canvas.height - 10);
          ctx2.restore();
        }
      }

      const run = async () => {
        if (!this.canvas || !this.card) return;

        const tip = await fetchTipHeight();
        if (tip && tip !== this.lastTip) this.lastTip = tip;

        // seed makes layout stable for a tip height
        const seed = fnv1a32(String(this.lastTip ?? "x"));
        const rnd = mulberry32(seed);

        // choose sample txids deterministically from the head of mempool
        const txids = await fetchTxids(300);
        if (!txids.length) {
          if (this.metaEl) this.metaEl.textContent = "block/0 — no txids";
          return;
        }

        // pick a subset with deterministic jitter (prevents identical frames)
        const want = 160; // tune: bigger = heavier network
        const picked = [];
        for (let i = 0; i < txids.length && picked.length < want; i++) {
          // keep most, drop some, stable-ish
          if (rnd() > 0.55) picked.push(txids[i]);
        }
        if (picked.length < 80) picked.push(...txids.slice(0, 80));

        // fetch details with caching
        const need = [];
        for (const id of picked) if (!this.cacheTx.has(id)) need.push(id);

        // capped parallelism (browser-friendly)
        const concurrency = 10;
        let idx = 0;
        const workers = Array.from({ length: concurrency }, async () => {
          while (idx < need.length) {
            const j = idx++;
            const txid = need[j];
            const info = await fetchTx(txid);
            if (info) this.cacheTx.set(txid, info);
          }
        });
        await Promise.all(workers);

        // build tiles
        const tiles = [];
        for (const id of picked) {
          const info = this.cacheTx.get(id);
          if (!info) continue;
          const sz = sizeClass(info.vsize);
          tiles.push({ txid: id, sz, vsize: info.vsize, fee: info.fee });
        }

        // order: higher fee-rate first, then larger size (tetris feel)
        tiles.sort((a,b) => {
          const ar = (Number.isFinite(a.fee) && a.vsize) ? (a.fee/a.vsize) : -1;
          const br = (Number.isFinite(b.fee) && b.vsize) ? (b.fee/b.vsize) : -1;
          if (br !== ar) return br - ar;
          return b.sz - a.sz;
        });

        const th = theme();
        const gap = Number.isFinite(th.gap) ? th.gap : 1;
        const placed = packTiles(tiles, this.canvas.width, this.canvas.height, gap);

        // meta: fill estimate (area occupancy)
        const area = placed.reduce((s,p)=>s + (p.w*p.h), 0);
        const pct = (area / (this.canvas.width*this.canvas.height)) * 100;

        if (this.metaEl) {
          this.metaEl.textContent = `block/0 · tip ${this.lastTip ?? "—"} · tiles ${placed.length} · fill ${pct.toFixed(1)}%`;
        }

        draw(this.canvas, placed, `block/0 · tip ${this.lastTip ?? "—"}`);
      };

      run();
      this._t = setInterval(run, 8_000); // “real time-ish” without melting APIs
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
