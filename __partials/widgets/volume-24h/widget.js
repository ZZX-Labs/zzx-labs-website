// __partials/widgets/volume-24h/widget.js
// DROP-IN (core-compatible, no runtime.js, no ctx.util/api dependencies)

(function () {
  "use strict";

  const W = window;
  const Core = W.ZZXWidgetsCore;
  if (!Core || typeof Core.onMount !== "function") return;

  // Coinbase Exchange candles:
  // Each row: [time, low, high, open, close, volume]
  // granularity=900 => 15m candles; 96 candles ≈ 24h
  const CANDLES_15M = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    const abs = Math.abs(x);
    if (abs >= 1e12) return (x / 1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return (x / 1e9).toFixed(2) + "B";
    if (abs >= 1e6)  return (x / 1e6).toFixed(2) + "M";
    if (abs >= 1e3)  return (x / 1e3).toFixed(2) + "K";
    return x.toFixed(2);
  }

  function setCard(root, valueText, subText) {
    const v = root.querySelector("[data-val]");
    const s = root.querySelector("[data-sub]");
    if (v) v.textContent = valueText;
    if (s) s.textContent = subText;
  }

  function drawSpark(root, series) {
    const svg = root.querySelector("[data-spark]");
    if (!svg) return;

    const line = svg.querySelector("path.line");
    const fill = svg.querySelector("path.fill");
    if (!line || !fill) return;

    const w = 300, h = 38, pad = 2;
    const data = Array.isArray(series) ? series.filter(Number.isFinite) : [];
    if (data.length < 2) {
      line.setAttribute("d", "");
      fill.setAttribute("d", "");
      return;
    }

    let min = Infinity, max = -Infinity;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      line.setAttribute("d", "");
      fill.setAttribute("d", "");
      return;
    }

    const dx = (w - pad * 2) / (data.length - 1);
    const scaleY = (h - pad * 2) / (max - min);

    let d = "";
    for (let i = 0; i < data.length; i++) {
      const x = pad + i * dx;
      const y = (h - pad) - (data[i] - min) * scaleY;
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
    }

    line.setAttribute("d", d.trim());

    // Fill to baseline
    const firstX = pad;
    const lastX = pad + (data.length - 1) * dx;
    const baseY = h - pad;
    const fd = `M ${firstX.toFixed(2)} ${baseY.toFixed(2)} ` + d.trim() + ` L ${lastX.toFixed(2)} ${baseY.toFixed(2)} Z`;
    fill.setAttribute("d", fd);
  }

  Core.onMount("volume-24h", (root) => {
    if (!root) return;

    // prevent double intervals on reinjection
    if (root.__zzxVol24Timer) {
      clearInterval(root.__zzxVol24Timer);
      root.__zzxVol24Timer = null;
    }

    let inflight = false;

    async function update() {
      if (inflight) return;
      inflight = true;

      try {
        const r = await fetch(CANDLES_15M, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const candles = await r.json();
        if (!Array.isArray(candles) || candles.length < 2) return;

        // Coinbase returns newest-first; take the newest ~24h
        const slice = candles.slice(0, 96).slice().reverse(); // oldest->newest for sparkline

        let totalUsd = 0;
        const volsUsd = [];

        for (const row of slice) {
          const close = Number(row?.[4]);
          const volBtc = Number(row?.[5]);
          if (!Number.isFinite(close) || !Number.isFinite(volBtc)) continue;
          const v = close * volBtc;
          totalUsd += v;
          volsUsd.push(v);
        }

        setCard(root, `$${fmtBig(totalUsd)}`, "Coinbase Exchange (15m candles)");
        drawSpark(root, volsUsd);
      } catch (_) {
        // keep last values on network hiccups
      } finally {
        inflight = false;
      }
    }

    update();
    root.__zzxVol24Timer = setInterval(update, 60_000);
  });
})();
