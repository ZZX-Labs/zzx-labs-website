// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (v3) — no page HTML changes required.
// - Auto-loads bitnodes-snapshots.js (same directory) if missing.
// - Uses window.ZZXBitnodesCache.snapshotPair() for shared cached Bitnodes fetch.
// - Computes Core vs Knots totals from UA map.
// - Best-effort "unreachable" = positive delta vs previous snapshot (heuristic).
// - Tor: uses Bitnodes tor field if present; per-client tor by UA-key heuristic if present (usually unavailable).

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const DEFAULTS = {
    REFRESH_MS: 10 * 60_000,
    LOAD_TIMEOUT_MS: 12_000,
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

  function fmtInt(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"; }
  function fmtPct(frac) { return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—"; }

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  // -----------------------------
  // Helper loader (no HTML edits)
  // -----------------------------
  function getCurrentScriptBase() {
    // Best-effort base path of this widget.js, so we can load bitnodes-snapshots.js beside it.
    // Works when script is loaded via <script src=".../widget.js">.
    const cs = document.currentScript;
    const src = cs && cs.src ? cs.src : "";
    if (!src) return null;
    return src.slice(0, src.lastIndexOf("/") + 1);
  }

  function loadScriptOnce(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-zzx-src="${url}"]`);
      if (existing) {
        if (existing.dataset.zzxLoaded === "1") return resolve(true);
        if (existing.dataset.zzxLoaded === "0") return reject(new Error("previous load failed"));
        // still loading
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => reject(new Error("failed to load " + url)), { once: true });
        return;
      }

      const s = document.createElement("script");
      s.async = true;
      s.src = url;
      s.dataset.zzxSrc = url;
      s.dataset.zzxLoaded = "";
      s.onload = () => { s.dataset.zzxLoaded = "1"; resolve(true); };
      s.onerror = () => { s.dataset.zzxLoaded = "0"; reject(new Error("failed to load " + url)); };
      document.head.appendChild(s);
    });
  }

  async function ensureBitnodesCacheLoaded() {
    if (W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function") return true;

    const base = getCurrentScriptBase();
    // If we cannot infer base, we fall back to a plain relative path.
    const url = (base ? (base + "bitnodes-snapshots.js") : "bitnodes-snapshots.js");

    await withTimeout(loadScriptOnce(url), DEFAULTS.LOAD_TIMEOUT_MS, "load bitnodes-snapshots.js");

    if (!(W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function")) {
      throw new Error("bitnodes-snapshots.js loaded but cache API missing");
    }
    return true;
  }

  // -----------------------------
  // Classification / sums
  // -----------------------------
  function classifyClient(uaKey) {
    const s = String(uaKey || "").toLowerCase();
    if (s.includes("bitcoinknots") || s.includes("bitcoin knots") || s.includes("knots")) return "knots";
    return "core";
  }

  function isTorUAKey(uaKey) {
    const s = String(uaKey || "").toLowerCase();
    return s.includes(".onion") || s.includes("onion") || s.includes("tor");
  }

  function sumBuckets(uaMap) {
    let core = 0, knots = 0, total = 0;
    let torCore = 0, torKnots = 0, torTotal = 0;

    for (const [ua, v] of Object.entries(uaMap || {})) {
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

  function computeDeltaHeuristic(latestBuckets, prevBuckets) {
    if (!prevBuckets) {
      return { totalUnreach: NaN, coreUnreach: NaN, knotsUnreach: NaN, note: "unreachable: delta unavailable" };
    }
    const totalUnreach = Math.max(0, latestBuckets.total - prevBuckets.total);
    const coreUnreach = Math.max(0, latestBuckets.core - prevBuckets.core);
    const knotsUnreach = Math.max(0, latestBuckets.knots - prevBuckets.knots);
    return { totalUnreach, coreUnreach, knotsUnreach, note: "unreachable: +delta vs prev snapshot (heuristic)" };
  }

  // -----------------------------
  // Render
  // -----------------------------
  function render(root, model) {
    const {
      badge,
      reachTotal,
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
      stampLatest,
      stampPrev,
      note
    } = model;

    setText(root, "[data-kvc-badge]", badge || "Bitnodes");

    setText(root, "[data-kvc-summary]", Number.isFinite(reachTotal) ? `${fmtInt(reachTotal)} reachable nodes` : "—");
    setText(root, "[data-kvc-sub]", stampPrev ? "delta vs prev snapshot enabled" : "delta vs prev snapshot unavailable");

    setText(root, "[data-kvc-core-reach]", fmtInt(coreReach));
    setText(root, "[data-kvc-knots-reach]", fmtInt(knotsReach));
    setText(root, "[data-kvc-total-reach]", fmtInt(reachTotal));

    setText(root, "[data-kvc-core-unreach]", Number.isFinite(coreUnreach) ? fmtInt(coreUnreach) : "—");
    setText(root, "[data-kvc-knots-unreach]", Number.isFinite(knotsUnreach) ? fmtInt(knotsUnreach) : "—");
    setText(root, "[data-kvc-total-unreach]", Number.isFinite(totalUnreach) ? fmtInt(totalUnreach) : "—");

    setText(root, "[data-kvc-core-tor]", Number.isFinite(torCore) ? fmtInt(torCore) : "—");
    setText(root, "[data-kvc-knots-tor]", Number.isFinite(torKnots) ? fmtInt(torKnots) : "—");
    setText(root, "[data-kvc-total-tor]", Number.isFinite(torTotal) ? fmtInt(torTotal) : "—");

    setText(root, "[data-kvc-core-pct]", fmtPct(corePct));
    setText(root, "[data-kvc-knots-pct]", fmtPct(knotsPct));
    setText(root, "[data-kvc-total-pct]", "100%");

    setWidth(root, "[data-kvc-bar-core]", Number.isFinite(corePct) ? corePct * 100 : 0);
    setWidth(root, "[data-kvc-bar-knots]", Number.isFinite(knotsPct) ? knotsPct * 100 : 0);

    const ts = `latest: ${stampLatest || "—"}` + (stampPrev ? ` · prev: ${stampPrev}` : "");
    setText(root, "[data-kvc-note]", `Bitnodes snapshots (shared cache) • Core=non-Knots bucket • ${note || ""} • ${ts}`.trim());
  }

  function renderError(root, err) {
    const msg = String(err?.message || err || "unknown error");
    setText(root, "[data-kvc-badge]", "error");
    setText(root, "[data-kvc-summary]", "—");
    setText(root, "[data-kvc-sub]", "error: " + msg);
    setText(root, "[data-kvc-note]", "Bitnodes snapshot fetch failed (shared cache).");
  }

  // -----------------------------
  // Main refresh loop
  // -----------------------------
  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-kvc-badge]", "syncing…");
      setText(root, "[data-kvc-sub]", "loading…");

      await ensureBitnodesCacheLoaded();

      const pair = await W.ZZXBitnodesCache.snapshotPair();
      const latest = pair?.latest || null;
      const prev = pair?.prev || null;

      const latestBuckets = sumBuckets(latest?.ua || {});
      const prevBuckets = prev ? sumBuckets(prev?.ua || {}) : null;

      const reachTotal = Number.isFinite(latest?.reachable) ? Number(latest.reachable) : latestBuckets.total;

      // Reachable per client uses UA sums (Bitnodes doesn't reliably split reachable per client otherwise)
      const coreReach = latestBuckets.core;
      const knotsReach = latestBuckets.knots;

      const denom = coreReach + knotsReach;
      const corePct = denom > 0 ? coreReach / denom : NaN;
      const knotsPct = denom > 0 ? knotsReach / denom : NaN;

      // Unreachable: prefer explicit aggregate if provided, otherwise delta heuristic.
      let totalUnreach = Number.isFinite(latest?.unreachable) ? Number(latest.unreachable) : NaN;
      const heur = computeDeltaHeuristic(latestBuckets, prevBuckets);

      if (!Number.isFinite(totalUnreach)) totalUnreach = heur.totalUnreach;

      // Per-client unreachable is not provided by Bitnodes; we show heuristic deltas
      const coreUnreach = heur.coreUnreach;
      const knotsUnreach = heur.knotsUnreach;

      // Tor: if Bitnodes gives aggregate tor, use it for total; per-client tor usually unknown.
      // We also attempt UA-key tor heuristic if present.
      const torTotal = Number.isFinite(latest?.tor) ? Number(latest.tor)
        : (latestBuckets.torTotal > 0 ? latestBuckets.torTotal : NaN);

      const torCore = (latestBuckets.torCore > 0) ? latestBuckets.torCore : NaN;
      const torKnots = (latestBuckets.torKnots > 0) ? latestBuckets.torKnots : NaN;

      const note = (Number.isFinite(latest?.unreachable) ? "unreachable: Bitnodes field" : heur.note) +
        (Number.isFinite(latest?.tor) ? " • tor: Bitnodes field" : "");

      render(root, {
        badge: "Bitnodes",
        reachTotal,
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
        stampLatest: latest?.stamp || null,
        stampPrev: prev?.stamp || null,
        note
      });

    } catch (e) {
      renderError(root, e);
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
