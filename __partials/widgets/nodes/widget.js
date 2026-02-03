// __partials/widgets/nodes/widget.js
// DROP-IN (FIXED + uses adapter + chart if present)
//
// Fixes:
// - Your widget.js was reading data.total_nodes / latest_height / timestamp directly,
//   but you also have an adapter.js that already normalizes payload drift.
// - This version loads sources.js + fetch.js + adapter.js (+ chart.js optional) from same dir.
// - Uses fetch.js cached/backoff logic, but renders via adapter normalized fields.
// - Exports window.ZZXNodesLatest (stable) for other widgets to baseline off.
// - Prevents duplicate intervals on reinjection.

(function () {
  "use strict";

  const W = window;
  const ID = "nodes";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = String(text ?? "—");
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtWhenMs(tsMs) {
    if (!Number.isFinite(tsMs) || tsMs <= 0) return "—";
    return new Date(tsMs).toLocaleString();
  }

  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/nodes/";
  }

  async function loadScriptOnce(url, key) {
    const existing = document.querySelector(`script[data-zzx-js="${key}"]`);
    if (existing) {
      await new Promise(r => setTimeout(r, 0));
      return existing.dataset.zzxLoaded !== "0";
    }
    return await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.dataset.zzxLoaded = "";
      s.onload = () => { s.dataset.zzxLoaded = "1"; resolve(true); };
      s.onerror = () => { s.dataset.zzxLoaded = "0"; resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function ensureDeps() {
    const base = widgetBasePath();

    if (!W.ZZXNodesSources?.endpoints?.bitnodesLatest) {
      const ok = await loadScriptOnce(base + "sources.js", "zzx:nodes:sources");
      if (!ok) return { ok: false, why: "sources.js missing (failed to load)" };
      await new Promise(r => setTimeout(r, 0));
      if (!W.ZZXNodesSources?.endpoints?.bitnodesLatest) return { ok: false, why: "sources.js did not register" };
    }

    if (!W.ZZXNodesFetch?.fetchJSON) {
      const ok = await loadScriptOnce(base + "fetch.js", "zzx:nodes:fetch");
      if (!ok) return { ok: false, why: "fetch.js missing (failed to load)" };
      await new Promise(r => setTimeout(r, 0));
      if (!W.ZZXNodesFetch?.fetchJSON) return { ok: false, why: "fetch.js did not register" };
    }

    if (!W.ZZXNodesAdapter?.normalizeLatest) {
      const ok = await loadScriptOnce(base + "adapter.js", "zzx:nodes:adapter");
      if (!ok) return { ok: false, why: "adapter.js missing (failed to load)" };
      await new Promise(r => setTimeout(r, 0));
      if (!W.ZZXNodesAdapter?.normalizeLatest) return { ok: false, why: "adapter.js did not register" };
    }

    // Optional: chart support if you later add an SVG.
    if (!W.ZZXNodesChart?.pushPoint) {
      await loadScriptOnce(base + "chart.js", "zzx:nodes:chart");
      await new Promise(r => setTimeout(r, 0));
    }

    return { ok: true };
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-nodes-sub]", `error: ${deps.why}`);
        return;
      }

      const url = W.ZZXNodesSources.endpoints.bitnodesLatest;
      const policy = W.ZZXNodesSources.policy || {};
      const cache = W.ZZXNodesSources.cache || {};

      setText(root, "[data-nodes-sub]", "loading…");

      const res = await W.ZZXNodesFetch.fetchJSON({
        url,
        cacheKey: cache.key || "zzx:nodes:bitnodes:latest:v1",
        metaKey: cache.metaKey || "zzx:nodes:bitnodes:meta:v1",
        ttlMs: Number(policy.cacheTtlMs) || (6 * 60 * 60_000),
        timeoutMs: Number(policy.timeoutMs) || 12_000
      });

      const normalized = W.ZZXNodesAdapter.normalizeLatest(res?.data);

      const totalNodes = Number(normalized.totalNodes);
      const latestHeight = Number(normalized.latestHeight);
      const updatedMs = Number(normalized.updatedMs);

      setText(root, "[data-nodes-total]", fmtInt(totalNodes));
      setText(root, "[data-nodes-height]", fmtInt(latestHeight));
      setText(root, "[data-nodes-updated]", fmtWhenMs(updatedMs));

      const staleTag = res?.stale ? " (stale cache)" : "";
      setText(root, "[data-nodes-sub]", `Bitnodes latest snapshot · ${res.source}${staleTag}`);

      // Export a stable baseline for other widgets
      W.ZZXNodesLatest = {
        total_nodes: totalNodes,
        latest_height: latestHeight,
        timestamp_ms: updatedMs,
        _source: res?.source || "unknown",
        _stale: !!res?.stale,
        _cachedAt: res?.cachedAt || null
      };

      // Optional sparkline history if you add an SVG later
      if (W.ZZXNodesChart?.pushPoint) {
        W.ZZXNodesChart.pushPoint(totalNodes);
        const svg = root.querySelector("[data-nodes-svg]");
        if (svg && W.ZZXNodesChart.draw) W.ZZXNodesChart.draw(svg);
      }

    } catch (e) {
      const msg = String(e?.message || e);
      setText(root, "[data-nodes-sub]", `error: ${msg}`);
      if (DEBUG) console.warn("[nodes]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxNodesTimer) {
      clearInterval(root.__zzxNodesTimer);
      root.__zzxNodesTimer = null;
    }

    update(root);

    // Refresh cadence from policy (default 30m) with small jitter
    const baseRefresh = Number(W.ZZXNodesSources?.policy?.refreshMs) || (30 * 60_000);
    const jitter = Math.floor(Math.random() * 12_000);
    root.__zzxNodesTimer = setInterval(() => update(root), baseRefresh + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, (root) => boot(root));
  } else {
    if (DEBUG) console.warn("[nodes] no widget registry found");
  }
})();
