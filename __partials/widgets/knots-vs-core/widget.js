// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (v3) — no page HTML changes required.
//
// Fixes:
// - Removes the 12s "bitnodes latest after 12000ms" failure mode.
// - Uses shared Bitnodes snapshot cache + proxy rotation from bitnodes-snapshots.js.
// - Correctly sums ALL Core (non-Knots bucket) vs ALL Knots across UA map.
// - "Unreachable" column is rendered as "delta vs previous snapshot" (positive delta heuristic).
// - Tor is shown as aggregate if Bitnodes exposes tor/onion totals; per-client Tor is rendered as "—" (not reliably derivable).

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const DEFAULTS = {
    REFRESH_MS: 10 * 60_000,
    HELPER_BOOT_TIMEOUT_MS: 12_000
  };

  function qs(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) {
    const el = qs(root, sel);
    if (el) el.textContent = String(text ?? "—");
  }
  function setWidth(root, sel, pct0to100) {
    const el = qs(root, sel);
    if (!el) return;
    const p = Number.isFinite(pct0to100) ? Math.max(0, Math.min(100, pct0to100)) : 0;
    el.style.width = p.toFixed(2) + "%";
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }
  function fmtPct(frac) {
    return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—";
  }

  function classifyClient(uaKey) {
    const s = String(uaKey || "").toLowerCase();
    if (s.includes("bitcoinknots") || s.includes("bitcoin knots") || s.includes("knots")) return "knots";
    return "core"; // your definition: Core = non-Knots bucket
  }

  function sumBuckets(userAgentsMap) {
    let total = 0, core = 0, knots = 0;
    for (const [ua, v] of Object.entries(userAgentsMap || {})) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      total += n;
      if (classifyClient(ua) === "knots") knots += n;
      else core += n;
    }
    return { total, core, knots };
  }

  function deltaHeuristic(latestBuckets, prevBuckets) {
    // Positive deltas only (avoids negative churn)
    if (!prevBuckets) {
      return { total: NaN, core: NaN, knots: NaN, note: "delta vs prev snapshot unavailable" };
    }
    return {
      total: Math.max(0, latestBuckets.total - prevBuckets.total),
      core: Math.max(0, latestBuckets.core - prevBuckets.core),
      knots: Math.max(0, latestBuckets.knots - prevBuckets.knots),
      note: "delta vs prev snapshot enabled"
    };
  }

  function render(root, d) {
    setText(root, "[data-kvc-badge]", d.badge || "Bitnodes");

    setText(root, "[data-kvc-core-reach]", fmtInt(d.coreReach));
    setText(root, "[data-kvc-knots-reach]", fmtInt(d.knotsReach));
    setText(root, "[data-kvc-total-reach]", fmtInt(d.reachable));

    setText(root, "[data-kvc-core-unreach]", Number.isFinite(d.coreDelta) ? fmtInt(d.coreDelta) : "—");
    setText(root, "[data-kvc-knots-unreach]", Number.isFinite(d.knotsDelta) ? fmtInt(d.knotsDelta) : "—");
    setText(root, "[data-kvc-total-unreach]", Number.isFinite(d.totalDelta) ? fmtInt(d.totalDelta) : "—");

    // Tor per-client is not reliably derivable from UA distribution
    setText(root, "[data-kvc-core-tor]", "—");
    setText(root, "[data-kvc-knots-tor]", "—");
    setText(root, "[data-kvc-total-tor]", Number.isFinite(d.tor) ? fmtInt(d.tor) : "—");

    setText(root, "[data-kvc-core-pct]", fmtPct(d.corePct));
    setText(root, "[data-kvc-knots-pct]", fmtPct(d.knotsPct));
    setText(root, "[data-kvc-total-pct]", "100%");

    setWidth(root, "[data-kvc-bar-core]", Number.isFinite(d.corePct) ? (d.corePct * 100) : 0);
    setWidth(root, "[data-kvc-bar-knots]", Number.isFinite(d.knotsPct) ? (d.knotsPct * 100) : 0);

    const summary = Number.isFinite(d.reachable)
      ? `${fmtInt(d.reachable)} reachable nodes`
      : `reachable nodes`;

    setText(root, "[data-kvc-summary]", summary);
    setText(root, "[data-kvc-sub]", d.deltaNote || "—");

    const tsText =
      (d.latestStamp ? `latest: ${d.latestStamp}` : "latest: —") +
      (d.prevStamp ? ` · prev: ${d.prevStamp}` : "");

    setText(
      root,
      "[data-kvc-note]",
      `Bitnodes snapshots (shared cache) • Core=non-Knots bucket • ${tsText}`.trim()
    );
  }

  // ---- helper loader (no HTML edits) ----

  function resolveSiblingUrl(filename) {
    const cs = document.currentScript;
    const src = cs && cs.src ? String(cs.src) : "";
    if (!src) return filename;
    const base = src.slice(0, src.lastIndexOf("/") + 1);
    return base + filename;
  }

  function loadScriptOnce(url) {
    return new Promise((resolve, reject) => {
      const exists = Array.from(document.scripts || []).some(s => String(s.src || "") === url);
      if (exists) return resolve(true);

      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error("failed to load " + url));
      document.head.appendChild(s);
    });
  }

  async function ensureBitnodesHelper() {
    if (W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function") return true;

    const helperUrl = resolveSiblingUrl("bitnodes-snapshots.js");
    await loadScriptOnce(helperUrl);

    const start = Date.now();
    while (!(W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function")) {
      if ((Date.now() - start) > DEFAULTS.HELPER_BOOT_TIMEOUT_MS) {
        throw new Error("bitnodes helper not ready");
      }
      await new Promise(r => setTimeout(r, 50));
    }
    return true;
  }

  // ---- refresh loop ----

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-kvc-badge]", "syncing…");
      setText(root, "[data-kvc-sub]", "loading snapshots…");

      await ensureBitnodesHelper();

      const pair = await W.ZZXBitnodesCache.snapshotPair();
      const latest = pair.latest;
      const prev = pair.prev;

      const latestBuckets = sumBuckets(latest.ua);
      const prevBuckets = prev ? sumBuckets(prev.ua) : null;

      // Reachable is the baseline for “Reachable” column. Fall back to UA sum if missing.
      const reachable = Number.isFinite(latest.reachable) ? latest.reachable : latestBuckets.total;

      // Share percentages (Core vs Knots only)
      const denom = latestBuckets.core + latestBuckets.knots;
      const corePct = denom > 0 ? (latestBuckets.core / denom) : NaN;
      const knotsPct = denom > 0 ? (latestBuckets.knots / denom) : NaN;

      const d = deltaHeuristic(latestBuckets, prevBuckets);

      render(root, {
        badge: "Bitnodes",
        latestStamp: latest.stamp,
        prevStamp: prev ? prev.stamp : null,

        reachable,
        tor: latest.tor,

        coreReach: latestBuckets.core,
        knotsReach: latestBuckets.knots,

        totalDelta: d.total,
        coreDelta: d.core,
        knotsDelta: d.knots,
        deltaNote: d.note,

        corePct,
        knotsPct
      });

    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      setText(root, "[data-kvc-badge]", "error");
      setText(root, "[data-kvc-summary]", "—");
      setText(root, "[data-kvc-sub]", "error: " + msg);
      setText(root, "[data-kvc-note]", "Bitnodes snapshot fetch failed (shared cache).");

      [
        "[data-kvc-core-reach]","[data-kvc-core-unreach]","[data-kvc-core-tor]","[data-kvc-core-pct]",
        "[data-kvc-knots-reach]","[data-kvc-knots-unreach]","[data-kvc-knots-tor]","[data-kvc-knots-pct]",
        "[data-kvc-total-reach]","[data-kvc-total-unreach]","[data-kvc-total-tor]"
      ].forEach(sel => setText(root, sel, "—"));

      setWidth(root, "[data-kvc-bar-core]", 0);
      setWidth(root, "[data-kvc-bar-knots]", 0);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxKVCTimer) {
      clearInterval(root.__zzxKVCTimer);
      root.__zzxKVCTimer = null;
    }

    refresh(root);
    root.__zzxKVCTimer = setInterval(() => refresh(root), DEFAULTS.REFRESH_MS);
  }

  // Register with your widget core(s)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
