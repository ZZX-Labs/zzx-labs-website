// __partials/widgets/mempool-specs/animation.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Tween between two tile layouts where each tile is identified by txid.
// - Supports square tiles: { txid, x, y, side, feeRate, ... }
// - Keeps "side" from destination layout (to) to avoid shape wobble.
// - Provides a cancellable RAF loop with easing.
//
// Exposes:
//   window.ZZXMempoolSpecs.Anim.Anim
//     - play(fromLayout, toLayout, onFrame)
//     - stop()
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const API = (NS.Anim = NS.Anim || {});

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

  function mapByTxid(layout) {
    const m = new Map();
    const arr = (layout && Array.isArray(layout.placed)) ? layout.placed : [];
    for (const p of arr) m.set(String(p.txid), p);
    return m;
  }

  function tween(from, to, t) {
    const A = mapByTxid(from);
    const out = [];

    const dst = (to && Array.isArray(to.placed)) ? to.placed : [];
    for (const q of dst) {
      const id = String(q.txid);
      const p = A.get(id);

      if (!p) {
        // pop-in: start at its own location but fade-in handled by renderer later if desired
        out.push({ ...q });
        continue;
      }

      out.push({
        ...q,
        x: lerp(Number(p.x) || 0, Number(q.x) || 0, t),
        y: lerp(Number(p.y) || 0, Number(q.y) || 0, t),
        // lock to "to" side to prevent breathing
        side: Number(q.side) || 1
      });
    }

    return { placed: out };
  }

  class Anim {
    constructor(opts = {}) {
      this.ms = Number.isFinite(opts.ms) ? opts.ms : 650;
      this._raf = 0;
      this._t0 = 0;
      this._from = null;
      this._to = null;
      this._cb = null;
      this._running = false;
    }

    stop() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    play(fromLayout, toLayout, onFrame) {
      this.stop();

      this._from = fromLayout || { placed: [] };
      this._to = toLayout || { placed: [] };
      this._cb = (typeof onFrame === "function") ? onFrame : null;

      this._running = true;
      this._t0 = performance.now();

      const tick = () => {
        if (!this._running) return;

        const now = performance.now();
        const u = Math.min(1, Math.max(0, (now - this._t0) / this.ms));
        const t = easeInOut(u);

        const lay = tween(this._from, this._to, t);
        if (this._cb) this._cb(lay, u);

        if (u < 1) this._raf = requestAnimationFrame(tick);
        else this.stop();
      };

      this._raf = requestAnimationFrame(tick);
    }
  }

  API.Anim = Anim;
})();
