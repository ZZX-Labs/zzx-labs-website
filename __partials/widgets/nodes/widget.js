// __partials/widgets/nodes/widget.js
// DROP-IN
// Uses:
//   window.ZZXNodesSources.endpoints.bitnodesLatest
//   window.ZZXNodesFetch.fetchJSON({url, cacheKey, ttlMs, timeoutMs})
//
// DOM contract (your widget.html):
//   [data-nodes-total], [data-nodes-height], [data-nodes-updated], [data-nodes-sub]

(function(){
  "use strict";

  const W = window;
  const ID = "nodes";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function fmtInt(n){
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function setText(root, sel, text){
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function fmtWhen(tsSec){
    if (!Number.isFinite(tsSec) || tsSec <= 0) return "—";
    const d = new Date(tsSec * 1000);
    return d.toLocaleString();
  }

  async function ensureDeps(){
    // If you want auto-load, you can add loader here. For now, assume both exist.
    if (!W.ZZXNodesSources?.endpoints?.bitnodesLatest) throw new Error("sources.js missing (ZZXNodesSources)");
    if (!W.ZZXNodesFetch?.fetchJSON) throw new Error("fetch.js missing (ZZXNodesFetch)");
    return true;
  }

  async function update(root){
    if (!root || inflight) return;
    inflight = true;

    try{
      await ensureDeps();

      const url = W.ZZXNodesSources.endpoints.bitnodesLatest;
      const policy = W.ZZXNodesSources.policy || {};
      const cache = W.ZZXNodesSources.cache || {};

      setText(root, "[data-nodes-sub]", "loading…");

      const res = await W.ZZXNodesFetch.fetchJSON({
        url,
        cacheKey: cache.key,
        metaKey: cache.metaKey,
        ttlMs: policy.cacheTtlMs || (6 * 60 * 60_000),
        timeoutMs: policy.timeoutMs || 12_000
      });

      const data = res?.data || {};

      // Bitnodes fields (current known)
      const total  = Number(data.total_nodes);
      const height = Number(data.latest_height);
      const ts     = Number(data.timestamp);

      setText(root, "[data-nodes-total]", fmtInt(total));
      setText(root, "[data-nodes-height]", fmtInt(height));
      setText(root, "[data-nodes-updated]", fmtWhen(ts));

      const staleTag = res?.stale ? " (stale cache)" : "";
      setText(root, "[data-nodes-sub]", `Bitnodes latest snapshot · ${res.source}${staleTag}`);

      // Optional: publish to global for other widgets (nodes-by-nation etc.)
      W.ZZXNodesLatest = {
        total_nodes: total,
        latest_height: height,
        timestamp: ts,
        _source: res.source,
        _stale: !!res.stale,
        _cachedAt: res.cachedAt || null
      };

    }catch(e){
      const msg = String(e?.message || e);
      setText(root, "[data-nodes-sub]", `error: ${msg}`);
      if (DEBUG) console.warn("[nodes]", e);
    }finally{
      inflight = false;
    }
  }

  function boot(root){
    if (!root) return;

    // avoid duplicates
    if (root.__zzxNodesTimer){
      clearInterval(root.__zzxNodesTimer);
      root.__zzxNodesTimer = null;
    }

    update(root);

    const refreshMs =
      (W.ZZXNodesSources?.policy?.refreshMs) ||
      (30 * 60_000);

    // Jitter to avoid synchronized spikes across clients
    const jitter = Math.floor(Math.random() * 12_000); // 0-12s
    root.__zzxNodesTimer = setInterval(()=>update(root), refreshMs + jitter);
  }

  if (W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID, (root)=>boot(root));
  } else if (W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID, (root)=>boot(root));
  }
})();
