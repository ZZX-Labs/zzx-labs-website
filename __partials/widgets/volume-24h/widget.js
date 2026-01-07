// __partials/widgets/volume-24h/widget.js
// DROP-IN REPLACEMENT (volume + % change + 24h area spark, spill-proof)
//
// Source: Coinbase Exchange 1h candles
// - Volume series = candle[5]
// - Displayed value = SUM(last 24 volume points) as 24h total volume (BTC)
// - % change = compare SUM(first 12h) vs SUM(last 12h) in the 24h window

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

  function fmtBTC(n) {
    if (!Number.isFinite(n)) return "—";
    // Volume can be large; keep readable.
    try {
      return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return String(n.toFixed(2));
    }
  }

  function setText(el, s) {
    if (!el) return;
    el.textContent = String(s ?? "");
  }

  function setDelta(el, pct) {
    if (!el) return;
    el.classList.remove("is-up", "is-dn", "is-flat");

    if (!Number.isFinite(pct)) {
      el.classList.add("is-flat");
      setText(el, "—%");
      return;
    }

    const sign = pct > 0 ? "+" : "";
    setText(el, `${sign}${pct.toFixed(2)}%`);

    if (pct > 0.01) el.classList.add("is-up");
    else if (pct < -0.01) el.classList.add("is-dn");
    else el.classList.add("is-flat");
  }

  async function fetchCandles(fetchJSON, url) {
    const data = await fetchJSON(url);
    if (!Array.isArray(data)) return null;

    const rows = data
      .map((r) => (Array.isArray(r) ? r : null))
      .filter(Boolean);

    if (rows.length < 2) return null;

    // [time, low, high, open, close, volume]
    rows.sort((a, b) => Number(a[0]) - Number(b[0]));
    return rows;
  }

  function drawAreaSpark(canvas, series) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
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
    if (max === min) max = min + 1;

    const padL = 10, padR = 10, padT = 10, padB = 12;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);

    const xAt = (i) => padL + (i / (n - 1)) * iw;
    const yAt = (v) => padT + (1 - ((v - min) / (max - min))) * ih;

    // area
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.lineTo(padL + iw, padT + ih);
    ctx.lineTo(padL, padT + ih);
    ctx.closePath();
    ctx.fillStyle = "rgba(192,214,116,.14)";
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(series[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.strokeStyle = "rgba(192,214,116,1)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function boot(root, core) {
    if (!root) return;

    const card =
      root.querySelector('[data-widget-root="volume-24h"]') || root;

    const volEl   = card.querySelector("[data-vol]");
    const deltaEl = card.querySelector("[data-delta]");
    const subEl   = card.querySelector("[data-sub]");
    const canvas  = card.querySelector("canvas[data-spark]") || card.querySelector("canvas.btc-spark");

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

        const last = rows.slice(-24);
        if (last.length < 8) return;

        const vols = last.map((r) => Number(r[5])); // volume
        const sum24 = vols.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

        setText(volEl, fmtBTC(sum24));

        // % change using 12h halves (first 12 vs last 12)
        const first12 = vols.slice(0, 12).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);
        const last12  = vols.slice(12).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

        const pct = (Number.isFinite(first12) && first12 !== 0)
          ? ((last12 - first12) / first12) * 100
          : NaN;

        setDelta(deltaEl, pct);

        setText(subEl, "Coinbase Exchange (1h candles)");
        if (subEl) subEl.style.color = "#b7bf9a";

        if (canvas) {
          const wrap = canvas.parentElement || canvas;
          const rect = wrap.getBoundingClientRect();
          const dpr = Math.max(1, window.devicePixelRatio || 1);

          const cssW = Math.max(260, Math.floor(rect.width || 320));
          const cssH = 60;

          const pxW = Math.floor(cssW * dpr);
          const pxH = Math.floor(cssH * dpr);

          if (canvas.width !== pxW || canvas.height !== pxH) {
            canvas.width = pxW;
            canvas.height = pxH;
            canvas.style.height = cssH + "px";
          }

          drawAreaSpark(canvas, vols);
        }
      } catch (e) {
        setText(subEl, `error: ${String(e && e.message ? e.message : e)}`);
        if (subEl) subEl.style.color = "#ff5a5a";
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
