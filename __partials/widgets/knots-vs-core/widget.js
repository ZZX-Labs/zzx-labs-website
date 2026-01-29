// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (manifest/core compatible)
// Goal:
// - Show Core vs Knots counts, plus Reachable/Unreachable/Tor breakdown (best-effort).
// - Uses Bitnodes snapshots via allorigins (through bitnodes-snapshots.js helper).
// - Computes deltas vs previous snapshot where possible.
// - Idempotent mount; no runtime.js required.

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const DEFAULTS = {
    REFRESH_MS: 10 * 60_000,
    // When deltas are computed, show +/- with sign. If previous snapshot missing, show "unavailable".
  };

  function $(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  function setText(root, sel, text) {
    const el = $(root, sel);
    if (el) el.textContent = text;
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtSignedInt(n) {
    if (!Number.isFinite(n)) return "unavailable";
    const v = Math.round(n);
    if (v === 0) return "0";
    return (v > 0 ? "+" : "−") + Math.abs(v).toLocaleString();
  }

  function fmtPctFrac(frac) {
    return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—";
  }

  function clamp01(x) {
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  // UA classification:
  // - Knots: contains "bitcoinknots"
  // - Core bucket: everything else (mempool does this too; but note: forks that use Satoshi UA will land in Core bucket)
  function classifyUA(ua) {
    const s = String(ua || "").toLowerCase();
    if (s.includes("bitcoinknots")) return "knots";
    return "core";
  }

  function sumUA(map) {
    let t = 0;
    if (!map || typeof map !== "object") return 0;
    for (const v of Object.values(map)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) t += n;
    }
    return t;
  }

  function computeBuckets(uaMap) {
    let core = 0;
    let knots = 0;
    let total = 0;

    if (!uaMap || typeof uaMap !== "object") return { core: 0, knots: 0, total: 0 };

    for (const [ua, v] of Object.entries(uaMap)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      total += n;
      if (classifyUA(ua) === "knots") knots += n;
      else core += n;
    }
    return { core, knots, total };
  }

  // If Bitnodes provides no unreachable/tor, we display "—" (not "0") to avoid false confidence.
  function safeDisplayOrDash(n) {
    return Number.isFinite(n) ? fmtInt(n) : "—";
  }

  // Optional width-bar pieces if you keep them in CSS/HTML; if absent, harmless.
  function setWidth(root, sel, pct0to100) {
    const el = $(root, sel);
    if (!el) return;
    const p = Number.isFinite(pct0to100) ? Math.max(0, Math.min(100, pct0to100)) : 0;
    el.style.width = p.toFixed(2) + "%";
  }

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      // Ensure helper exists
      const helper = W.ZZXKnotsVsCore && W.ZZXKnotsVsCore.Bitnodes;
      if (!helper || typeof helper.snapshotPair !== "function") {
        throw new Error("missing helper: bitnodes-snapshots.js not loaded");
      }

      setText(root, "[data-kvc-sub]", "loading…");

      const pair = await helper.snapshotPair();
      const latest = pair.latest;
      const prev = pair.prev;

      const latestBuckets = computeBuckets(latest.ua);
      const prevBuckets = prev ? computeBuckets(prev.ua) : null;

      // Totals: prefer Bitnodes-reported totals if present, else UA sum.
      const latestTotal = Number.isFinite(latest.total) ? Number(latest.total) : latestBuckets.total;
      const prevTotal = prev && Number.isFinite(prev.total) ? Number(prev.total) : (prevBuckets ? prevBuckets.total : NaN);

      const core = latestBuckets.core;
      const knots = latestBuckets.knots;

      const corePct = latestTotal > 0 ? core / latestTotal : NaN;
      const knotsPct = latestTotal > 0 ? knots / latestTotal : NaN;

      // Reachable/unreachable/tor rows: we only have totals, not per-client, so:
      // - "Total (all clients)" row uses these.
      // - For per-client rows, we show Reachable = bucket count (UA map is effectively reachable sample),
      //   Unreachable/Tor are displayed as "—" because Bitnodes doesn't provide per-UA breakdown.
      //
      // This matches what you said you’re seeing: unreachable unavailable. We keep it honest.

      // Per-client rows (Reachable = counts from UA buckets)
      setText(root, "[data-kvc-core-reach]", fmtInt(core));
      setText(root, "[data-kvc-knots-reach]", fmtInt(knots));
      setText(root, "[data-kvc-core-pct]", fmtPctFrac(corePct));
      setText(root, "[data-kvc-knots-pct]", fmtPctFrac(knotsPct));

      // Per-client unreachable/tor are unknown from public API
      setText(root, "[data-kvc-core-unreach]", "—");
      setText(root, "[data-kvc-knots-unreach]", "—");
      setText(root, "[data-kvc-core-tor]", "—");
      setText(root, "[data-kvc-knots-tor]", "—");

      // Total row
      setText(root, "[data-kvc-total-reach]", fmtInt(Number.isFinite(latest.reachable) ? latest.reachable : latestTotal));
      setText(root, "[data-kvc-total-unreach]", safeDisplayOrDash(latest.unreachable));
      setText(root, "[data-kvc-total-tor]", safeDisplayOrDash(latest.tor));
      setText(root, "[data-kvc-total-pct]", "100%");

      // Summary line
      const summary = `${fmtInt(Number.isFinite(latest.reachable) ? latest.reachable : latestTotal)} reachable nodes`;
      setText(root, "[data-kvc-summary]", summary);

      // Delta vs prev snapshot (we use reachable if available, else total)
      let deltaBaseLatest = Number.isFinite(latest.reachable) ? latest.reachable : latestTotal;
      let deltaBasePrev = prev && Number.isFinite(prev.reachable) ? prev.reachable : prevTotal;

      const delta = (Number.isFinite(deltaBaseLatest) && Number.isFinite(deltaBasePrev))
        ? (deltaBaseLatest - deltaBasePrev)
        : NaN;

      setText(root, "[data-kvc-delta]", `delta vs prev snapshot ${fmtSignedInt(delta)}`);

      // Optional bar widths if you keep the bar elements in HTML/CSS
      setWidth(root, "[data-kvc-bar-core]", clamp01(corePct) * 100);
      setWidth(root, "[data-kvc-bar-knots]", clamp01(knotsPct) * 100);

      const stamp = latest.stamp ? String(latest.stamp) : "—";
      setText(
        root,
        "[data-kvc-note]",
        `Bitnodes snapshots (via allorigins) • Core=non-Knots bucket • unreachable: ${Number.isFinite(latest.unreachable) ? "available" : "unavailable"} • latest: ${stamp}`
      );

      setText(root, "[data-kvc-sub]", "Bitnodes");
    } catch (e) {
      const msg = String((e && e.message) || e || "error");
      setText(root, "[data-kvc-sub]", "error");
      setText(root, "[data-kvc-summary]", "—");
      setText(root, "[data-kvc-note]", msg);
      setText(root, "[data-kvc-delta]", "delta vs prev snapshot unavailable");
      // Reset table fields to dashes
      setText(root, "[data-kvc-core-reach]", "—");
      setText(root, "[data-kvc-core-unreach]", "—");
      setText(root, "[data-kvc-core-tor]", "—");
      setText(root, "[data-kvc-core-pct]", "—");
      setText(root, "[data-kvc-knots-reach]", "—");
      setText(root, "[data-kvc-knots-unreach]", "—");
      setText(root, "[data-kvc-knots-tor]", "—");
      setText(root, "[data-kvc-knots-pct]", "—");
      setText(root, "[data-kvc-total-reach]", "—");
      setText(root, "[data-kvc-total-unreach]", "—");
      setText(root, "[data-kvc-total-tor]", "—");
      setText(root, "[data-kvc-total-pct]", "—");
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    // Interval guard (idempotent)
    if (root.__zzxKVCTimer) {
      clearInterval(root.__zzxKVCTimer);
      root.__zzxKVCTimer = null;
    }

    refresh(root);
    root.__zzxKVCTimer = setInterval(() => refresh(root), DEFAULTS.REFRESH_MS);
  }

  // Register with your core (preferred), else legacy registry.
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  } else {
    // Minimal fallback: auto-boot any matching nodes at DOMContentLoaded
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll('[data-widget-root="knots-vs-core"]').forEach(boot);
    });
  }
})();
