// __partials/widgets/volume-24h/widget.js
// DROP-IN REPLACEMENT (works with widget-core.js onMount OR legacy register)
//
// Renders:
// - numeric value (24h total volume, BTC)
// - % change (24h, compares sum(volume) last 24h vs previous 24h using 15m candles)
// - area sparkline (volume per 15m over last 24h)
//
// Data source:
// - Prefers window.ZZX_API.COINBASE_CANDLES_15M if present
// - Falls back to Coinbase Exchange candles (15m): /products/BTC-USD/candles?granularity=900

(function () {
  "use strict";

  const W = window;

  const DEFAULT_CANDLES_15M =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

  function getCandlesUrl() {
    const u = W.ZZX_API && typeof W.ZZX_API.COINBASE_CANDLES_15M === "string"
      ? W.ZZX_API.COINBASE_CANDLES_15M
      : "";
    return u || DEFAULT_CANDLES_15M;
  }

  function setText(el, s) {
    if (!el) return;
    el.textContent = (s == null) ? "" : String(s);
  }

  function fmtBTC(n) {
    if (!Number.isFinite(n)) return "—";
    // Volume can be large; show 2 decimals by default
    try {
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return String(n.toFixed(2));
    }
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

  function drawAreaSpark(canvas, series, opts) {
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

    // subtle grid
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

    const line = (opts && opts.line) || "rgba(230,164,43,1)";      // accent-alt
    const fill = (opts && opts.fill) || "rgba(230,164,43,.14)";

    // fill under
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.lineTo(padL + iw, padT + ih);
    ctx.lineTo(padL, padT + ih);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // line stroke
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  async function fetchCandles(fetchJSON, url) {
    const data = await fetchJSON(url);
    if (!Array.isArray(data)) return null;

    // Coinbase Exchange candles: [ time, low, high, open, close, volume ]
    const rows = data
      .map((r) => Array.isArray(r) ? r : null)
      .filter(Boolean);

    if (rows.length < 2) return null;

    // Sort ascending by time (API returns newest-first typically)
    rows.sort((a, b) => Number(a[0]) - Number(b[0]));
    return rows;
  }

  function sum(arr) {
    let t = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) t += v;
    }
    return t;
  }

  function boot(root, core) {
    if (!root) return;

    const card =
      root.querySelector('[data-w="volume-24h"]') ||
      root.querySelector('[data-widget-root="volume-24h"]') ||
      root;

    if (!card) return;

    const elVal = card.querySelector("[data-val]");
    const elSub = card.querySelector("[data-sub]");

    if (card.__zzxVol24Timer) {
      clearInterval(card.__zzxVol24Timer);
      card.__zzxVol24Timer = null;
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

        // Need 48h of 15m candles for change vs previous day
        const last192 = rows.slice(-192); // 48h @ 15m
        if (last192.length < 96) return;

        const prev = last192.slice(0, Math.max(0, last192.length - 96));
        const curr = last192.slice(-96);

        const prevVols = prev.map((r) => Number(r[5]));
        const currVols = curr.map((r) => Number(r[5]));

        const prevSum = sum(prevVols);
        const currSum = sum(currVols);

        // Display total 24h BTC volume
        setText(elVal, fmtBTC(currSum));

        // % change vs previous 24h
        const changePct = prevSum !== 0 ? ((currSum - prevSum) / prevSum) * 100 : NaN;

        if (Number.isFinite(changePct)) {
          const arrow = changePct >= 0 ? "▲" : "▼";
          const sign = changePct >= 0 ? "+" : "";
          setText(elSub, `${arrow} ${sign}${changePct.toFixed(2)}% (24h)`);
          if (elSub) elSub.style.color = changePct >= 0 ? "#c0d674" : "#ff5a5a";
        } else {
          setText(elSub, "—");
          if (elSub) elSub.style.color = "";
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

          // Sparkline series: per-15m volume for last 24h
          const series = currVols.filter(Number.isFinite);

          drawAreaSpark(canvas, series, {
            line: "rgba(230,164,43,1)",
            fill: "rgba(230,164,43,.14)",
          });
        }
      } catch {
        // keep last values
      }
    }

    run();
    card.__zzxVol24Timer = setInterval(run, 60_000);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount("volume-24h", (root, core) => boot(root, core));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register("volume-24h", function (root, core) {
      boot(root, core);
    });
  }
})();
