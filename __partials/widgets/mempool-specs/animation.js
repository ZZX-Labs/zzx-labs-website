// __partials/widgets/mempool-specs/animation.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Deterministic, lightweight tweening between two layouts
// - No timers, RAF-only
// - Stable even if layouts change mid-flight
//
// Exposes:
//   window.ZZXMempoolSpecs.Anim

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOut(t) {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function tweenLayout(from, to, t) {
    const prev = new Map();
    for (const p of (from?.placed || [])) {
      prev.set(p.txid, p);
    }

    const out = [];
    for (const q of (to?.placed || [])) {
      const p = prev.get(q.txid);
      if (!p) {
        out.push({ ...q });
        continue;
      }

      out.push({
        ...q,
        x: lerp(p.x, q.x, t),
        y: lerp(p.y, q.y, t),
        side: q.side
      });
    }

    return { placed: out };
  }

  class Anim {
    constructor(opts = {}) {
      this.ms = Number.isFinite(opts.ms) ? opts.ms : 650;
      this._raf = 0;
      this._start = 0;
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
      this._to   = toLayout   || { placed: [] };
      this._cb   = typeof onFrame === "function" ? onFrame : null;
      this._start = performance.now();
      this._running = true;

      const tick = () => {
        if (!this._running) return;

        const now = performance.now();
        const u = Math.min(1, (now - this._start) / this.ms);
        const t = easeInOut(u);

        const layout = tweenLayout(this._from, this._to, t);
        if (this._cb) this._cb(layout, u);

        if (u < 1) {
          this._raf = requestAnimationFrame(tick);
        } else {
          this.stop();
        }
      };

      this._raf = requestAnimationFrame(tick);
    }
  }

  NS.Anim = { Anim };
})();
