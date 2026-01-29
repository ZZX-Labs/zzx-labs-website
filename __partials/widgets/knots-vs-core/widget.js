// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (v2) — no page HTML changes required.
//
// Goals:
// - Correctly sum ALL Bitcoin Core versions + ALL Bitcoin Knots versions from Bitnodes UA distribution.
// - Show:
//   1) Reachable nodes (Bitnodes latest snapshot UA map)
//   2) "Unreachable" / short-lived nodes (best-effort delta between latest snapshot and previous snapshot)
//   3) Tor nodes (best-effort: parse UA keys that look like /Satoshi:... (onion)/ if present; otherwise show "—")
//
// Data sources:
// - Bitnodes snapshots API via AllOrigins (to avoid CORS).
// - Optional: mempool.space is NOT authoritative for node counting; we only use it as a liveness hint if desired.
//   (Kept off by default to avoid extra calls.)
//
// Notes / Constraints:
// - Bitnodes UA distribution usually reflects reachable nodes (public). It does not always provide explicit
//   reachable+unreachable splits per client. "Unreachable" here is derived heuristically as:
//     max(0, (latest_total_seen - latest_reachable)) at aggregate level when available,
//   and per-client as:
//     max(0, (latest_client - previous_client)) for new/ephemeral appearances between snapshots.
//   If the API doesn’t expose needed fields, we will display "—" for unreachable/tor.
//
// - Idempotent; installs its own interval per widget root.

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  const DEFAULTS = {
    BITNODES_SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    // Some Bitnodes deployments expose /snapshots/<ts>/, others expose a "previous" link in payload.
    // We'll try to discover previous snapshot from latest payload; if not possible, we skip delta calc.
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    REFRESH_MS: 10 * 60_000,
    FETCH_TIMEOUT_MS: 12_000,
    // if true, attempt a small corroboration call to mempool.space
    USE_MEMPOOL_HINTS: false,
    MEMPOOL_BASE: "https://mempool.space/api",
  };

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

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

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // -----------------------------
  // Bitnodes payload handling
  // -----------------------------
  function extractUserAgents(payload) {
    // Best-effort; API can drift.
    // commonly: payload.user_agents: { "/Satoshi:25.0.0/": 123, "/BitcoinKnots:25.0/": 45, ... }
    if (!payload || typeof payload !== "object") return {};
    if (payload.user_agents && typeof payload.user_agents === "object") return payload.user_agents;
    if (payload.versions && typeof payload.versions === "object") return payload.versions;
    // Sometimes nested: payload.data.user_agents
    if (payload.data && payload.data.user_agents && typeof payload.data.user_agents === "object") return payload.data.user_agents;
    return {};
  }

  function extractTotals(payload) {
    // Try to find totals: reachable, total, etc.
    // Many snapshots expose: total_nodes, reachable_nodes, or similar.
    const p = payload || {};
    const reach =
      Number(p.reachable_nodes) ||
      Number(p.reachable) ||
      Number(p.total_reachable) ||
      Number(p.total_nodes) || // sometimes total_nodes == reachable
      Number(p.total) ||
      NaN;

    const totalSeen =
      Number(p.total_nodes) ||
      Number(p.total) ||
      Number(p.nodes) ||
      NaN;

    // Some APIs include "unreachable" directly
    const unreach =
      Number(p.unreachable_nodes) ||
      Number(p.unreachable) ||
      Number(p.total_unreachable) ||
      NaN;

    // If totalSeen is same as reach, unreachable may be absent.
    return { reach, totalSeen, unreach };
  }

  function findPreviousSnapshotUrl(latestPayload) {
    // Bitnodes might include links: { "previous": "https://bitnodes.io/api/v1/snapshots/..." }
    // Or it might include a timestamp field we can step back with.
    const p = latestPayload || {};
    if (p.previous) return String(p.previous);
    if (p.links && p.links.previous) return String(p.links.previous);
    if (p.data && p.data.previous) return String(p.data.previous);

    // Sometimes there's a timestamp field:
    // e.g. p.timestamp or p.ts, but without an index endpoint we can't reliably query previous.
    return null;
  }

  // -----------------------------
  // Classification
  // -----------------------------
  function classifyClient(uaKey) {
    const s = String(uaKey || "").toLowerCase();

    // Explicit Knots signatures
    if (s.includes("bitcoinknots") || s.includes("bitcoin knots") || s.includes("knots")) return "knots";

    // Core commonly advertises "/Satoshi:x.y.z/"
    // Many forks reuse Satoshi. For this widget, we bucket all non-knots into core.
    return "core";
  }

  function isTorUAKey(uaKey) {
    // Best-effort: some datasets embed onion host markers, or include "onion" / ".onion".
    // If UA keys have no such markers, Tor counts will be unknown and shown as "—".
    const s = String(uaKey || "").toLowerCase();
    return s.includes(".onion") || s.includes("onion") || s.includes("tor");
  }

  function sumBuckets(userAgentsMap) {
    let total = 0;
    let core = 0;
    let knots = 0;
    let torTotal = 0;
    let torCore = 0;
    let torKnots = 0;

    for (const [ua, v] of Object.entries(userAgentsMap || {})) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;

      total += n;

      const c = classifyClient(ua);
      if (c === "knots") knots += n;
      else core += n;

      if (isTorUAKey(ua)) {
        torTotal += n;
        if (c === "knots") torKnots += n;
        else torCore += n;
      }
    }

    return { total, core, knots, torTotal, torCore, torKnots };
  }

  function computeUnreachableHeuristic(latest, prev) {
    // This is intentionally conservative:
    // - If Bitnodes gives explicit unreachable count, use it at aggregate level.
    // - Per-client unreachable: use positive delta between latest and previous as "short-lived / newly seen".
    //   This is NOT the same as unreachable, but gives a useful "between snapshots" signal.
    //
    // If prev missing, return "unknown".
    if (!prev) {
      return {
        totalUnreach: NaN,
        coreUnreach: NaN,
        knotsUnreach: NaN,
        note: "unreachable derived: unavailable (no previous snapshot)"
      };
    }

    const dTotal = Math.max(0, (latest.total - prev.total));
    const dCore = Math.max(0, (latest.core - prev.core));
    const dKnots = Math.max(0, (latest.knots - prev.knots));

    return {
      totalUnreach: dTotal,
      coreUnreach: dCore,
      knotsUnreach: dKnots,
      note: "unreachable (heuristic): positive delta vs previous snapshot"
    };
  }

  // Optional: tiny hint endpoint (kept off by default)
  async function mempoolHint() {
    try {
      const url = DEFAULTS.MEMPOOL_BASE + "/mempool";
      const j = await fetchJSON(url);
      // not used for counts; only for liveness timestamp-ish
      return { ok: true, size: Number(j?.size) || null, vsize: Number(j?.vsize) || null };
    } catch (_) {
      return { ok: false };
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  function render(root, data) {
    const {
      latestTs,
      prevTs,
      reach,
      total,
      coreReach,
      knotsReach,
      corePct,
      knotsPct,
      // heuristic unreachable
      totalUnreach,
      coreUnreach,
      knotsUnreach,
      // tor
      torTotal,
      torCore,
      torKnots,
      // provenance
      note,
      badge
    } = data;

    setText(root, "[data-kvc-badge]", badge || "live");

    setText(root, "[data-kvc-core-reach]", fmtInt(coreReach));
    setText(root, "[data-kvc-knots-reach]", fmtInt(knotsReach));
    setText(root, "[data-kvc-total-reach]", fmtInt(reach));

    setText(root, "[data-kvc-core-unreach]", Number.isFinite(coreUnreach) ? fmtInt(coreUnreach) : "—");
    setText(root, "[data-kvc-knots-unreach]", Number.isFinite(knotsUnreach) ? fmtInt(knotsUnreach) : "—");
    setText(root, "[data-kvc-total-unreach]", Number.isFinite(totalUnreach) ? fmtInt(totalUnreach) : "—");

    setText(root, "[data-kvc-core-tor]", Number.isFinite(torCore) && torCore > 0 ? fmtInt(torCore) : "—");
    setText(root, "[data-kvc-knots-tor]", Number.isFinite(torKnots) && torKnots > 0 ? fmtInt(torKnots) : "—");
    setText(root, "[data-kvc-total-tor]", Number.isFinite(torTotal) && torTotal > 0 ? fmtInt(torTotal) : "—");

    setText(root, "[data-kvc-core-pct]", fmtPct(corePct));
    setText(root, "[data-kvc-knots-pct]", fmtPct(knotsPct));
    setText(root, "[data-kvc-total-pct]", "100%");

    setWidth(root, "[data-kvc-bar-core]", Number.isFinite(corePct) ? corePct * 100 : 0);
    setWidth(root, "[data-kvc-bar-knots]", Number.isFinite(knotsPct) ? knotsPct * 100 : 0);

    const summary = Number.isFinite(reach)
      ? `${fmtInt(reach)} reachable nodes`
      : `reachable nodes`;

    const sub = (Number.isFinite(total) && Number.isFinite(reach) && total > reach)
      ? `observed total: ${fmtInt(total)} (includes non-reachable)`
      : (prevTs ? `delta vs prev snapshot enabled` : `delta vs prev snapshot unavailable`);

    setText(root, "[data-kvc-summary]", summary);
    setText(root, "[data-kvc-sub]", sub);

    const tsText = (latestTs ? `latest: ${latestTs}` : "latest: —") + (prevTs ? ` · prev: ${prevTs}` : "");
    setText(root, "[data-kvc-note]", `Bitnodes snapshots (via allorigins) • Core=non-Knots bucket • ${note || ""} • ${tsText}`.trim());
  }

  // -----------------------------
  // Main refresh
  // -----------------------------
  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-kvc-badge]", "syncing…");
      setText(root, "[data-kvc-sub]", "loading snapshots…");

      const latestUrl = allOrigins(DEFAULTS.BITNODES_SNAPSHOT_LATEST);
      const latestPayload = await withTimeout(fetchJSON(latestUrl), DEFAULTS.FETCH_TIMEOUT_MS, "bitnodes latest");

      const latestMap = extractUserAgents(latestPayload);
      const latestBuckets = sumBuckets(latestMap);
      const totals = extractTotals(latestPayload);

      // reach: if totals.reach seems valid use it; else use UA sum
      const reach = Number.isFinite(totals.reach) ? totals.reach : latestBuckets.total;

      // total observed: if totals.totalSeen valid use it; else UA sum
      const total = Number.isFinite(totals.totalSeen) ? totals.totalSeen : latestBuckets.total;

      const coreReach = latestBuckets.core;
      const knotsReach = latestBuckets.knots;

      const corePct = (coreReach + knotsReach) > 0 ? (coreReach / (coreReach + knotsReach)) : NaN;
      const knotsPct = (coreReach + knotsReach) > 0 ? (knotsReach / (coreReach + knotsReach)) : NaN;

      // Tor best-effort
      const torTotal = latestBuckets.torTotal > 0 ? latestBuckets.torTotal : NaN;
      const torCore = latestBuckets.torCore > 0 ? latestBuckets.torCore : NaN;
      const torKnots = latestBuckets.torKnots > 0 ? latestBuckets.torKnots : NaN;

      // Previous snapshot (if discoverable)
      let prevPayload = null;
      let prevTs = null;
      const prevUrlRaw = findPreviousSnapshotUrl(latestPayload);
      if (prevUrlRaw) {
        try {
          prevPayload = await withTimeout(fetchJSON(allOrigins(prevUrlRaw)), DEFAULTS.FETCH_TIMEOUT_MS, "bitnodes previous");
          // Try to derive human-ish timestamp fields
          prevTs = String(prevPayload?.timestamp || prevPayload?.ts || prevPayload?.time || "").trim() || null;
        } catch (e) {
          if (DEBUG) console.warn("[KVC] previous snapshot fetch failed", e);
          prevPayload = null;
        }
      }

      const latestTs = String(latestPayload?.timestamp || latestPayload?.ts || latestPayload?.time || "").trim() || null;

      let totalUnreach = NaN, coreUnreach = NaN, knotsUnreach = NaN;
      let note = "";

      // If Bitnodes provides explicit unreachable totals, use aggregate
      if (Number.isFinite(totals.unreach)) {
        totalUnreach = totals.unreach;
        // Per-client unreachable still unknown; we’ll prefer delta heuristic if prev exists.
        note = "unreachable: Bitnodes aggregate field";
      }

      if (prevPayload) {
        const prevBuckets = sumBuckets(extractUserAgents(prevPayload));
        const heur = computeUnreachableHeuristic(
          { total: latestBuckets.total, core: latestBuckets.core, knots: latestBuckets.knots },
          { total: prevBuckets.total, core: prevBuckets.core, knots: prevBuckets.knots }
        );
        // If we already have totalUnreach from Bitnodes, keep it; else use heuristic.
        if (!Number.isFinite(totalUnreach)) totalUnreach = heur.totalUnreach;
        coreUnreach = heur.coreUnreach;
        knotsUnreach = heur.knotsUnreach;
        note = note ? (note + " + " + heur.note) : heur.note;
      } else {
        if (!note) note = "unreachable: unavailable";
      }

      // Optional mempool hint (kept off by default)
      if (DEFAULTS.USE_MEMPOOL_HINTS) {
        const hint = await mempoolHint();
        if (hint.ok) {
          note += ` • mempool hint: vsize=${fmtInt(hint.vsize)}`;
        }
      }

      render(root, {
        latestTs,
        prevTs,
        reach,
        total,
        coreReach,
        knotsReach,
        corePct,
        knotsPct,
        totalUnreach,
        coreUnreach,
        knotsUnreach,
        torTotal,
        torCore,
        torKnots,
        note,
        badge: "Bitnodes"
      });

    } catch (e) {
      const msg = String(e?.message || e);
      setText(root, "[data-kvc-badge]", "error");
      setText(root, "[data-kvc-summary]", "—");
      setText(root, "[data-kvc-sub]", "error: " + msg);
      setText(root, "[data-kvc-note]", "Bitnodes snapshot fetch failed (via allorigins).");
      if (DEBUG) console.warn("[ZZX:KNOTS-VS-CORE] refresh failed", e);
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

  // Register with your widget core
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
