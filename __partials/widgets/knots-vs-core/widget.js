// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (manifest/core compatible)
// - Uses allorigins for Bitnodes snapshot/user-agent distribution.
// - Computes Bitcoin Core vs Bitcoin Knots counts + % share.
// - Idempotent; no runtime.js.

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const DEFAULTS = {
    BITNODES_SNAPSHOT: "https://bitnodes.io/api/v1/snapshots/latest/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    REFRESH_MS: 10 * 60_000
  };

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtPctFrac(frac) {
    return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function setWidth(root, sel, pct0to100) {
    const el = root.querySelector(sel);
    if (!el) return;
    const p = Number.isFinite(pct0to100) ? Math.max(0, Math.min(100, pct0to100)) : 0;
    el.style.width = p.toFixed(2) + "%";
  }

  // Pull a map of user agents -> counts from whatever shape bitnodes returns.
  function extractUserAgents(payload) {
    // Best-effort, API can drift:
    // - payload.user_agents: { "/Satoshi:25.0.0/": 123, "/BitcoinKnots:25.0/": 45, ... }
    // - payload.versions: { ... } (sometimes)
    if (!payload || typeof payload !== "object") return {};
    if (payload.user_agents && typeof payload.user_agents === "object") return payload.user_agents;
    if (payload.versions && typeof payload.versions === "object") return payload.versions;
    return {};
  }

  function classify(ua) {
    const s = String(ua || "").toLowerCase();
    // Knots tends to contain "bitcoinknots"
    if (s.includes("bitcoinknots") || s.includes("knots")) return "knots";
    // Core user agent usually "satoshi" (bitcoind), but many forks also use it.
    // This widget is explicitly "Knots vs Core", so treat non-knots as core bucket.
    return "core";
  }

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-kvc-sub]", "loading…");

      const snap = await fetchJSON(allOrigins(DEFAULTS.BITNODES_SNAPSHOT));
      const map = extractUserAgents(snap);

      let total = 0;
      let core = 0;
      let knots = 0;

      for (const [ua, v] of Object.entries(map)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        total += n;
        if (classify(ua) === "knots") knots += n;
        else core += n;
      }

      // If total isn't derivable from UA map (rare), fall back to reported totals if present.
      if (!Number.isFinite(total) || total <= 0) {
        total = Number(snap.total_nodes) || Number(snap.total) || NaN;
      }

      const corePct = Number.isFinite(total) && total > 0 ? core / total : NaN;
      const knotsPct = Number.isFinite(total) && total > 0 ? knots / total : NaN;

      setText(root, "[data-kvc-core]", fmtInt(core));
      setText(root, "[data-kvc-knots]", fmtInt(knots));
      setText(root, "[data-kvc-core-pct]", fmtPctFrac(corePct));
      setText(root, "[data-kvc-knots-pct]", fmtPctFrac(knotsPct));

      setWidth(root, "[data-kvc-bar-core]", Number.isFinite(corePct) ? corePct * 100 : 0);
      setWidth(root, "[data-kvc-bar-knots]", Number.isFinite(knotsPct) ? knotsPct * 100 : 0);

      const summary = Number.isFinite(total)
        ? `${fmtInt(total)} reachable nodes`
        : `reachable nodes`;
      setText(root, "[data-kvc-summary]", summary);

      setText(root, "[data-kvc-note]", "Bitnodes snapshot (via allorigins) • UA heuristic: 'BitcoinKnots' => Knots");
      setText(root, "[data-kvc-sub]", "—");
    } catch (e) {
      setText(root, "[data-kvc-sub]", "error: " + String(e?.message || e));
      setText(root, "[data-kvc-summary]", "—");
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

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
