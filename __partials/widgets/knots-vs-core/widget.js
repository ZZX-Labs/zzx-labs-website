// __partials/widgets/knots-vs-core/widget.js
// DROP-IN (v4) — no page HTML changes required.
//
// Uses the timestamped Bitnodes snapshot payload (nodes map) via shared cache:
//   window.ZZXBitnodesCache.getSnapshotPair()
//   window.ZZXBitnodesCache.aggregate(snapshot)
//
// Fixes vs prior attempts:
// - Robustly loads bitnodes-snapshots.js from the same directory WITHOUT relying on document.currentScript.
// - Computes Core vs Knots from UA strings containing "Knots:".
// - Computes Tor from node keys containing ".onion" (accurate).
// - "Unreachable" column shows ephemeral delta (+new vs previous snapshot). (Bitnodes doesn't provide unreachable here.)
// - Shared cache prevents rate limit / multiple widgets hammering endpoints.

(function () {
  "use strict";

  const W = window;
  const ID = "knots-vs-core";

  const CFG = {
    REFRESH_MS: 10 * 60_000,
    LOAD_TIMEOUT_MS: 15_000,
    // file living beside this widget.js
    CACHE_SCRIPT: "bitnodes-snapshots.js",
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

  // ---------------------------------
  // Robust sibling script loader
  // ---------------------------------
  function findThisScriptBase() {
    // Prefer an actual <script src=".../knots-vs-core/widget.js"> tag.
    // Works even when document.currentScript is null.
    const scripts = Array.from(document.getElementsByTagName("script"));
    for (const s of scripts) {
      const src = String(s.src || "");
      if (!src) continue;
      if (src.includes("/knots-vs-core/widget.js") || src.endsWith("knots-vs-core/widget.js")) {
        return src.slice(0, src.lastIndexOf("/") + 1);
      }
      // fallback: if it ends with "/widget.js" and contains knots-vs-core
      if (src.includes("knots-vs-core") && src.endsWith("/widget.js")) {
        return src.slice(0, src.lastIndexOf("/") + 1);
      }
    }
    return null;
  }

  function loadScriptOnce(url) {
    return new Promise((resolve, reject) => {
      const key = `script[data-zzx-src="${url}"]`;
      const existing = document.querySelector(key);
      if (existing) {
        if (existing.dataset.zzxLoaded === "1") return resolve(true);
        if (existing.dataset.zzxLoaded === "0") return reject(new Error("failed to load " + url));
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

  async function ensureCacheLoaded() {
    if (W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.getSnapshotPair === "function") return true;

    const base = findThisScriptBase();
    const url = (base ? (base + CFG.CACHE_SCRIPT) : CFG.CACHE_SCRIPT);

    await withTimeout(loadScriptOnce(url), CFG.LOAD_TIMEOUT_MS, "load " + CFG.CACHE_SCRIPT);

    if (!(W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.getSnapshotPair === "function")) {
      throw new Error(CFG.CACHE_SCRIPT + " loaded but cache API missing");
    }
    return true;
  }

  // ---------------------------------
  // Render
  // ---------------------------------
  function render(root, m) {
    setText(root, "[data-kvc-badge]", m.badge || "Bitnodes");

    setText(root, "[data-kvc-summary]",
      Number.isFinite(m.reachTotal) ? `${fmtInt(m.reachTotal)} reachable nodes` : "—"
    );

    setText(root, "[data-kvc-sub]", m.prevStamp ? "delta vs prev snapshot enabled" : "delta vs prev snapshot unavailable");

    setText(root, "[data-kvc-core-reach]", fmtInt(m.coreReach));
    setText(root, "[data-kvc-knots-reach]", fmtInt(m.knotsReach));
    setText(root, "[data-kvc-total-reach]", fmtInt(m.reachTotal));

    // "Unreachable" column is your between-snapshots signal (ephemeral +new)
    setText(root, "[data-kvc-core-unreach]", Number.isFinite(m.coreDeltaNew) ? fmtInt(m.coreDeltaNew) : "—");
    setText(root, "[data-kvc-knots-unreach]", Number.isFinite(m.knotsDeltaNew) ? fmtInt(m.knotsDeltaNew) : "—");
    setText(root, "[data-kvc-total-unreach]", Number.isFinite(m.deltaNewTotal) ? fmtInt(m.deltaNewTotal) : "—");

    setText(root, "[data-kvc-core-tor]", Number.isFinite(m.torCore) ? fmtInt(m.torCore) : "—");
    setText(root, "[data-kvc-knots-tor]", Number.isFinite(m.torKnots) ? fmtInt(m.torKnots) : "—");
    setText(root, "[data-kvc-total-tor]", Number.isFinite(m.torTotal) ? fmtInt(m.torTotal) : "—");

    setText(root, "[data-kvc-core-pct]", fmtPct(m.corePct));
    setText(root, "[data-kvc-knots-pct]", fmtPct(m.knotsPct));
    setText(root, "[data-kvc-total-pct]", "100%");

    setWidth(root, "[data-kvc-bar-core]", Number.isFinite(m.corePct) ? m.corePct * 100 : 0);
    setWidth(root, "[data-kvc-bar-knots]", Number.isFinite(m.knotsPct) ? m.knotsPct * 100 : 0);

    const ts = `latest: ${m.latestStamp || "—"}` + (m.prevStamp ? ` · prev: ${m.prevStamp}` : "");
    setText(
      root,
      "[data-kvc-note]",
      `Bitnodes timestamped snapshots (shared cache) • Core=non-Knots • Δ new nodes shown in "Unreachable" column • ${ts}`.trim()
    );
  }

  function renderError(root, err) {
    const msg = String(err?.message || err || "unknown error");
    setText(root, "[data-kvc-badge]", "error");
    setText(root, "[data-kvc-summary]", "—");
    setText(root, "[data-kvc-sub]", "error: " + msg);
    setText(root, "[data-kvc-note]", "Bitnodes snapshot fetch failed (shared cache).");
  }

  // ---------------------------------
  // Model building
  // ---------------------------------
  function classifyUA(ua) {
    const s = String(ua || "").toLowerCase();
    return s.includes("knots:") ? "knots" : "core";
  }

  function countBucketsFromNodesMap(nodesMap) {
    // returns { total, core, knots }
    let total = 0, core = 0, knots = 0;
    for (const entry of Object.values(nodesMap || {})) {
      if (!Array.isArray(entry)) continue;
      total += 1;
      const ua = String(entry[1] || "");
      if (classifyUA(ua) === "knots") knots += 1;
      else core += 1;
    }
    return { total, core, knots };
  }

  // ---------------------------------
  // Refresh loop
  // ---------------------------------
  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-kvc-badge]", "syncing…");
      setText(root, "[data-kvc-sub]", "loading…");

      await ensureCacheLoaded();

      const pair = await W.ZZXBitnodesCache.getSnapshotPair();
      const latest = pair?.latest || null;
      const prev = pair?.prev || null;
      const delta = pair?.delta || null;

      if (!latest || !latest.nodes) throw new Error("missing latest snapshot nodes map");

      // Use shared aggregator (preferred) if present, else compute quick.
      const aggLatest = (typeof W.ZZXBitnodesCache.aggregate === "function")
        ? W.ZZXBitnodesCache.aggregate(latest)
        : null;

      const reachTotal = aggLatest ? aggLatest.total : Object.keys(latest.nodes).length;

      const coreReach = aggLatest ? aggLatest.core : countBucketsFromNodesMap(latest.nodes).core;
      const knotsReach = aggLatest ? aggLatest.knots : countBucketsFromNodesMap(latest.nodes).knots;

      const denom = coreReach + knotsReach;
      const corePct = denom > 0 ? coreReach / denom : NaN;
      const knotsPct = denom > 0 ? knotsReach / denom : NaN;

      // Tor from node keys (.onion) is accurate. Use agg when available.
      const torTotal = aggLatest ? aggLatest.torTotal : NaN;
      const torCore = aggLatest ? aggLatest.torCore : NaN;
      const torKnots = aggLatest ? aggLatest.torKnots : NaN;

      // Delta-new by client: compute via UA bucket delta using prev snapshot nodes map.
      let coreDeltaNew = NaN, knotsDeltaNew = NaN, deltaNewTotal = NaN;

      if (prev && prev.nodes) {
        // For delta-by-client, we need sets of keys and then classify only new keys.
        const prevKeys = new Set(Object.keys(prev.nodes));
        let newCore = 0, newKnots = 0, newTotal = 0;

        for (const [k, entry] of Object.entries(latest.nodes)) {
          if (prevKeys.has(k)) continue;
          newTotal += 1;
          const ua = Array.isArray(entry) ? String(entry[1] || "") : "";
          if (classifyUA(ua) === "knots") newKnots += 1;
          else newCore += 1;
        }

        coreDeltaNew = newCore;
        knotsDeltaNew = newKnots;
        deltaNewTotal = newTotal;

        // If cache computed delta.newNodes, prefer that for total consistency
        if (delta && Number.isFinite(delta.newNodes)) deltaNewTotal = Number(delta.newNodes);
      }

      render(root, {
        badge: "Bitnodes",
        reachTotal,
        coreReach,
        knotsReach,
        corePct,
        knotsPct,
        torTotal: Number.isFinite(torTotal) && torTotal > 0 ? torTotal : NaN,
        torCore: Number.isFinite(torCore) && torCore > 0 ? torCore : NaN,
        torKnots: Number.isFinite(torKnots) && torKnots > 0 ? torKnots : NaN,
        coreDeltaNew,
        knotsDeltaNew,
        deltaNewTotal,
        latestStamp: latest.stamp || (latest.ts ? String(latest.ts) : null),
        prevStamp: prev ? (prev.stamp || (prev.ts ? String(prev.ts) : null)) : null,
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
    root.__zzxKVCTimer = setInterval(() => refresh(root), CFG.REFRESH_MS);
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
