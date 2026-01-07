// __partials/widgets/mempool-specs/animation.js
// - Lightweight animation loop + tween between two layouts
// Exposes: window.ZZXMempoolSpecs.Anim

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

  // Create a tweened layout: match by txid; if missing, pop-in
  function tweenLayout(from, to, t) {
    const A = new Map();
    for (const p of (from?.placed || [])) A.set(p.txid, p);

    const out = [];
    for (const q of (to?.placed || [])) {
      const p = A.get(q.txid);
      if (!p) {
        // appear from its own position (no jump)
        out.push({ ...q });
        continue;
      }
      out.push({
        ...q,
        x: lerp(p.x, q.x, t),
        y: lerp(p.y, q.y, t),
        side: q.side, // keep side stable from "to"
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
      this._onFrame = null;
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
      this._onFrame = typeof onFrame === "function" ? onFrame : null;

      this._running = true;
      this._t0 = performance.now();

      const tick = () => {
        if (!this._running) return;

        const now = performance.now();
        const u = Math.min(1, Math.max(0, (now - this._t0) / this.ms));
        const t = easeInOut(u);

        const lay = tweenLayout(this._from, this._to, t);
        if (this._onFrame) this._onFrame(lay, u);

        if (u < 1) this._raf = requestAnimationFrame(tick);
        else this.stop();
      };

      this._raf = requestAnimationFrame(tick);
    }
  }

  NS.Anim = { Anim };
})();
