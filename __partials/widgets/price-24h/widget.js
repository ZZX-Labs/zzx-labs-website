// __partials/widgets/price-24h/widget.js
// DROP-IN REPLACEMENT (works with widget-core.js onMount OR legacy register)
//
// Renders:
// - numeric value (last close, USD)
// - % change (24h, based on first/last close in last 96x 15m candles)
// - area sparkline (canvas, created if missing)
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

    // If your primitives CSS already defines .btc-spark, reuse it.
    let c = card.querySelector("canvas.btc-spark");
    if (c) return c;

    c = document.createElement("canvas");
    c.className = "btc-spark";
    c.setAttribute("aria-hidden", "true");

    // Ensure it has a reasonable intrinsic size; CSS can scale it.
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

    const line = (opts && opts.line) || "rgba(192,214,116,1)";
    const fill = (opts && opts.fill) || "rgba(192,214,116,.14)";

    // path
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));

    // fill under
    ctx.save();
    ctx.lineTo(padL + iw, padT + ih);
    ctx.lineTo(padL, padT + ih);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    // line stroke
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
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

  function boot(root, core) {
    if (!root) return;

    const card =
      root.querySelector('[data-w="price-24h"]') ||
      root.querySelector('[data-widget-root="price-24h"]') ||
      root;

    if (!card) return;

    const elVal = card.querySelector("[data-val]");
    const elSub = card.querySelector("[data-sub]");

    // Avoid double timers on reinjection
    if (card.__zzxPrice24Timer) {
      clearInterval(card.__zzxPrice24Timer);
      card.__zzxPrice24Timer = null;
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

        const last96 = rows.slice(-96); // 24h @ 15m
        const closes = last96.map((r) => Number(r[4])).filter(Number.isFinite);
        if (closes.length < 2) return;

        const first = closes[0];
        const last = closes[closes.length - 1];

        const changePct = first !== 0 ? ((last - first) / first) * 100 : NaN;

        setText(elVal, fmtUSD(last));

        if (Number.isFinite(changePct)) {
          const arrow = changePct >= 0 ? "▲" : "▼";
          const sign = changePct >= 0 ? "+" : "";
          setText(elSub, `${arrow} ${sign}${changePct.toFixed(2)}% (24h)`);
          // tint sub text (optional; won’t break if CSS overrides)
          if (elSub) elSub.style.color = changePct >= 0 ? "#c0d674" : "#ff5a5a";
        } else {
          setText(elSub, "—");
          if (elSub) elSub.style.color = "";
        }

        const canvas = ensureCanvas(card);

        // Keep canvas sized to its rendered box for crispness
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
          drawAreaSpark(canvas, closes, {
            line: "rgba(192,214,116,1)",
            fill: "rgba(192,214,116,.14)",
          });
        }
      } catch {
        // keep last values
      }
    }

    run();
    card.__zzxPrice24Timer = setInterval(run, 60_000);
  }

  // Preferred path: widget-core lifecycle (fires AFTER HTML injected)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount("price-24h", (root, core) => boot(root, core));
    return;
  }

  // Legacy shim path
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register("price-24h", function (root, core) {
      boot(root, core);
    });
  }
})();
