// __partials/widgets/high-low-24h/widget.js
// DROP-IN REPLACEMENT (core-widget compatible; NO runtime.js)
//
// Renders:
// - 24h High / Low values
// - subline: % spread and source
// - single area sparkline (1h closes over last 24h)
// - markers: green dot at high, red dot at low (on the same chart)
//
// Data source:
// - Coinbase Exchange candles (1h): /products/BTC-USD/candles?granularity=3600
// - Prefers window.ZZX_API.COINBASE_CANDLES_1H if defined

(function () {
  "use strict";

  const W = window;

  const DEFAULT_CANDLES_1H =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600";

  function getCandlesUrl() {
    const u = W.ZZX_API && typeof W.ZZX_API.COINBASE_CANDLES_1H === "string"
      ? W.ZZX_API.COINBASE_CANDLES_1H
      : "";
    return u || DEFAULT_CANDLES_1H;
  }

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    try {
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return String(n.toFixed(2));
    }
  }

  function setText(el, s) {
    if (!el) return;
    el.textContent = (s == null) ? "" : String(s);
  }

  function ensureCanvas(card) {
    if (!card) return null;

    let c = card.querySelector("canvas.btc-spark");
    if (c) return c;

    c = document.createElement("canvas");
    c.className = "btc-spark";
    c.setAttribute("aria-hidden", "true");
    c.width = 600;
    c.height = 120;

    card.appendChild(c);
    return c;
  }

  function drawSparkWithMarkers(canvas, series, markerIdxHi, markerIdxLo) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const w = canvas.width || 600;
    const h = canvas.height || 120;
    ctx.clearRect(0, 0, w, h);

    const n = series.length;
    if (n < 2) return;

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (max === min) { max = min + 1; }

    const padL = 10, padR = 10, padT = 10, padB = 12;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);

    const xAt = (i) => padL + (i / (n - 1)) * iw;
    const yAt = (v) => padT + (1 - ((v - min) / (max - min))) * ih;

    // grid
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    for (let g = 1; g <= 2; g++) {
      const yy = padT + (ih * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + iw, yy);
      ctx.stroke();
    }
    ctx.restore();

    // area
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.lineTo(padL + iw, padT + ih);
    ctx.lineTo(padL, padT + ih);
    ctx.closePath();
    ctx.fillStyle = "rgba(230,164,43,.14)";
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.strokeStyle = "rgba(230,164,43,1)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // markers
    function dot(i, color) {
      if (!Number.isFinite(i) || i < 0 || i >= n) return;
      const x = xAt(i);
      const y = yAt(series[i]);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.stroke();
    }

    dot(markerIdxHi, "#43d17a"); // green high
    dot(markerIdxLo, "#ff5a5a"); // red low
  }

  async function fetchCandles(fetchJSON, url) {
    const data = await fetchJSON(url);
    if (!Array.isArray(data)) return null;

    // rows: [ time, low, high, open, close, volume ]
    const rows = data
      .map((r) => Array.isArray(r) ? r : null)
      .filter(Boolean);

    if (rows.length < 2) return null;

    // sort ascending by time
    rows.sort((a, b) => Number(a[0]) - Number(b[0]));
    return rows;
  }

  function boot(root, core) {
    if (!root) return;

    const card =
      root.querySelector('[data-widget-root="high-low-24h"]') ||
      root;

    const hiEl = card.querySelector("[data-hi]");
    const loEl = card.querySelector("[data-lo]");
    const subEl = card.querySelector("[data-sub]");

    if (card.__zzxHiLo24Timer) {
      clearInterval(card.__zzxHiLo24Timer);
      card.__zzxHiLo24Timer = null;
    }

    const URL = getCandlesUrl();

    const fetchJSON =
      core && typeof core.fetchJSON === "function"
        ? (u) => core.fetchJSON(u)
        : async (u) => {
            const r = await fetch(u, { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            return await r.json();
          };

    async function run() {
      try {
        const rows = await fetchCandles(fetchJSON, URL);
        if (!rows) return;

        // Use last 24 x 1h candles (approx 24h)
        const last = rows.slice(-24);
        if (last.length < 8) return;

        // series for spark: closes
        const closes = last.map((r) => Number(r[4]));

        let hi = -Infinity, lo = Infinity;
        let hiIdx = -1, loIdx = -1;

        for (let i = 0; i < last.length; i++) {
          const low = Number(last[i][1]);
          const high = Number(last[i][2]);

          if (Number.isFinite(high) && high > hi) { hi = high; hiIdx = i; }
          if (Number.isFinite(low) && low < lo) { lo = low; loIdx = i; }
        }

        setText(hiEl, fmtUSD(hi));
        setText(loEl, fmtUSD(lo));

        if (Number.isFinite(hi) && Number.isFinite(lo) && lo > 0) {
          const spreadPct = ((hi - lo) / lo) * 100;
          setText(subEl, `spread ${spreadPct.toFixed(2)}% • Coinbase Exchange (1h candles)`);
          if (subEl) subEl.style.color = "#b7bf9a";
        } else {
          setText(subEl, "Coinbase Exchange (1h candles)");
          if (subEl) subEl.style.color = "#b7bf9a";
        }

        const canvas = ensureCanvas(card);
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
          const cw = Math.max(260, Math.floor(rect.width || 320));
          const ch = Math.max(52, Math.floor(rect.height || 60));
          const pw = Math.floor(cw * dpr);
          const ph = Math.floor(ch * dpr);
          if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
          }

          // Marker indices should match *closes* index positions.
          // We mark the candle high/low index positions on the close-series chart (good enough + consistent).
          const series = closes.filter(Number.isFinite);
          // If any non-finite closes trimmed, index mapping could drift; avoid trimming to keep indices stable.
          drawSparkWithMarkers(canvas, closes, hiIdx, loIdx);
        }
      } catch (e) {
        setText(subEl, `error: ${String(e && e.message ? e.message : e)}`);
        if (subEl) subEl.style.color = "#ff5a5a";
      }
    }

    run();
    card.__zzxHiLo24Timer = setInterval(run, 60_000);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount("high-low-24h", (root, core) => boot(root, core));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register("high-low-24h", function (root, core) {
      boot(root, core);
    });
  }
})();
