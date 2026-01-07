// __partials/widgets/hashrate/widget.js
// DROP-IN (manifest/core compatible; no runtime dependency)

(function () {
  "use strict";

  const W = window;

  const ID = "hashrate";

  // Data sources (public, no keys)
  const MEMPOOL = "https://mempool.space";
  const URL_HASHRATE_3D = `${MEMPOOL}/api/v1/mining/hashrate/3d`; // ~hourly points over 3d
  const URL_DIFF_ADJ    = `${MEMPOOL}/api/v1/difficulty-adjustment`;

  // Assumption for power estimate (Joules per TH)
  // You can tune later via W.ZZX_MINING?.J_PER_TH
  const DEFAULT_J_PER_TH = 30;

  let inflight = false;

  function fmtNum(n, digits = 2) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "—";
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function getJPerTH() {
    const v = W.ZZX_MINING && Number(W.ZZX_MINING.J_PER_TH);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_J_PER_TH;
  }

  // Convert hashrate points (H/s) -> ZH/s
  function hsToZH(hs) {
    const n = Number(hs);
    return Number.isFinite(n) ? (n / 1e21) : NaN;
  }

  // Sparkline paths (simple & stable)
  function buildSpark(valuesZH) {
    const w = 300, h = 70, pad = 6;
    const vals = valuesZH.filter(Number.isFinite);
    if (!vals.length) return { line: "", area: "" };

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = (max - min) || 1;

    const n = valuesZH.length;
    const pts = valuesZH.map((v, i) => {
      const x = (i / Math.max(1, n - 1)) * (w - pad * 2) + pad;
      const vv = Number.isFinite(v) ? v : min;
      const y = (h - pad) - ((vv - min) / span) * (h - pad * 2);
      return [x, y];
    });

    const line = "M " + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");

    const area = [
      line,
      `L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)}`,
      `L ${pad.toFixed(2)} ${(h - pad).toFixed(2)}`,
      "Z"
    ].join(" ");

    return { line, area };
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const jPerTH = getJPerTH();
      setText(root, "[data-hr-eff]", fmtInt(jPerTH));

      // --- Hashrate series ---
      // mempool endpoint returns array of objects (typical shape):
      // [{ timestamp: <ms|s>, hashrate: <H/s> }, ...]
      const series = await fetchJSON(URL_HASHRATE_3D);
      const arr = Array.isArray(series) ? series : (series && series.hashrates) || [];

      // Try to normalize regardless of exact field names
      const points = (Array.isArray(arr) ? arr : [])
        .map((p) => ({
          t: Number(p.timestamp ?? p.time ?? p[0]),
          hs: Number(p.hashrate ?? p.value ?? p[1]),
        }))
        .filter((p) => Number.isFinite(p.hs));

      if (!points.length) throw new Error("hashrate series empty");

      // Latest point
      const latest = points[points.length - 1];
      const zhNow = hsToZH(latest.hs);

      setText(root, "[data-hr-zh]", fmtNum(zhNow, 3));

      // 24h window: take last ~24 points (series is typically 1h granularity)
      const last24 = points.slice(Math.max(0, points.length - 24));
      const last24ZH = last24.map(p => hsToZH(p.hs));

      // Sparkline
      const svg = root.querySelector("[data-hr-svg]");
      if (svg) {
        const { line, area } = buildSpark(last24ZH);
        const pLine = svg.querySelector("[data-hr-line]");
        const pArea = svg.querySelector("[data-hr-area]");
        if (pLine) pLine.setAttribute("d", line);
        if (pArea) pArea.setAttribute("d", area);
      }

      // Power estimate:
      // TH/s = ZH/s * 1e9
      // W = TH/s * J/TH  (since J/s = W)
      const watts = zhNow * 1e9 * jPerTH;
      const gw = watts / 1e9;

      // Energy per hour:
      // Wh = W * 1h  => GWh = (W/1e9)
      const gwh1 = gw; // since GW * 1h = GWh

      // Energy last 24h: integrate average power across the 24 points
      const avgZH24 = last24ZH.filter(Number.isFinite).reduce((a,b)=>a+b,0) / Math.max(1, last24ZH.filter(Number.isFinite).length);
      const wattsAvg24 = avgZH24 * 1e9 * jPerTH;
      const gwAvg24 = wattsAvg24 / 1e9;
      const gwh24 = gwAvg24 * 24;

      setText(root, "[data-hr-power]", Number.isFinite(gw) ? `${fmtNum(gw, 2)} GW` : "—");
      setText(root, "[data-hr-e1]", Number.isFinite(gwh1) ? `${fmtNum(gwh1, 2)} GWh` : "—");
      setText(root, "[data-hr-e24]", Number.isFinite(gwh24) ? `${fmtNum(gwh24, 1)} GWh` : "—");

      // --- Difficulty ---
      // mempool difficulty-adjustment endpoint includes currentDifficulty
      const diff = await fetchJSON(URL_DIFF_ADJ);
      const dNow =
        Number(diff?.difficulty) ||
        Number(diff?.currentDifficulty) ||
        Number(diff?.previousRetarget) ||
        NaN;

      // Difficulty is huge; show as integer with commas.
      setText(root, "[data-hr-diff]", Number.isFinite(dNow) ? fmtInt(dNow) : "—");

      // --- Tor mining hashrate ---
      // There is no reliable public feed for “miners behind Tor” as a network-wide share.
      // We keep the slot stable and explicit so you can wire your own telemetry later.
      setText(root, "[data-hr-tor]", "—");
      setText(root, "[data-hr-tor-note]", "no public feed");

      setText(root, "[data-hr-sub]", "Source: mempool.space (hashrate 3d + difficulty-adjustment)");
    } catch (e) {
      setText(root, "[data-hr-sub]", `error: ${String(e?.message || e)}`);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    // prevent duplicate timers on reinjection
    if (root.__zzxHashrateTimer) {
      clearInterval(root.__zzxHashrateTimer);
      root.__zzxHashrateTimer = null;
    }

    update(root);
    root.__zzxHashrateTimer = setInterval(() => update(root), 60_000);
  }

  // Core lifecycle
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  // Legacy registry fallback
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
