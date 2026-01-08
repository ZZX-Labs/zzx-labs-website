// __partials/widgets/nodes/widget.js
// DROP-IN REPLACEMENT
// - Auto-loads sources.js + fetch.js from same widget dir
// - Uses cached/backoff fetch logic in nodes/fetch.js
// - Prevents duplicate intervals

(function () {
  "use strict";

  const W = window;
  const ID = "nodes";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtWhen(tsSec) {
    if (!Number.isFinite(tsSec) || tsSec <= 0) return "—";
    return new Date(tsSec * 1000).toLocaleString();
  }

  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/nodes/";
  }

  async function loadScriptOnce(url, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      await new Promise(r => setTimeout(r, 0));
      return true;
    }
    return await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.setAttribute("data-zzx-js", key);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
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

      const data = res?.data || {};

      const total = Number(data.total_nodes);
      const height = Number(data.latest_height);
      const ts = Number(data.timestamp);

      setText(root, "[data-nodes-total]", fmtInt(total));
      setText(root, "[data-nodes-height]", fmtInt(height));
      setText(root, "[data-nodes-updated]", fmtWhen(ts));

      const staleTag = res?.stale ? " (stale cache)" : "";
      setText(root, "[data-nodes-sub]", `Bitnodes latest snapshot · ${res.source}${staleTag}`);

      // Optional export for other widgets
      W.ZZXNodesLatest = {
        total_nodes: total,
        latest_height: height,
        timestamp: ts,
        _source: res?.source || "unknown",
        _stale: !!res?.stale,
        _cachedAt: res?.cachedAt || null
      };

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

    // Prefer policy refresh if sources.js is present later; default 30 min
    const baseRefresh = Number(W.ZZXNodesSources?.policy?.refreshMs) || (30 * 60_000);
    const jitter = Math.floor(Math.random() * 12_000); // 0–12s
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
