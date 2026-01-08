// __partials/widgets/nodes/widget.js
// DROP-IN (MODULAR)
// - Auto-loads sources.js + fetch.js + adapter.js (+chart.js optional)
// - Uses Bitnodes latest snapshot (direct -> allorigins fallback handled in fetch.js)
// - Safe reinjection (clears interval)
// - Keeps your current widget.html contract intact

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

  function fmtInt(x) {
    const v = Number(x);
    return Number.isFinite(v) ? Math.round(v).toLocaleString() : "—";
  }

  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/nodes/";
  }

  async function loadScriptOnce(url, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      await Promise.resolve();
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

    if (!W.ZZXNodesSources?.endpoints) {
      const ok = await loadScriptOnce(base + "sources.js", "zzx:nodes:sources");
      if (!ok) return { ok: false, why: "sources.js missing" };
      if (!W.ZZXNodesSources?.endpoints) return { ok: false, why: "sources.js did not register" };
    }

    if (!W.ZZXNodesFetch?.fetchJSON) {
      const ok = await loadScriptOnce(base + "fetch.js", "zzx:nodes:fetch");
      if (!ok) return { ok: false, why: "fetch.js missing" };
      if (!W.ZZXNodesFetch?.fetchJSON) return { ok: false, why: "fetch.js did not register" };
    }

    if (!W.ZZXNodesAdapter?.normalizeLatest) {
      const ok = await loadScriptOnce(base + "adapter.js", "zzx:nodes:adapter");
      if (!ok) return { ok: false, why: "adapter.js missing" };
      if (!W.ZZXNodesAdapter?.normalizeLatest) return { ok: false, why: "adapter.js did not register" };
    }

    // chart is optional; never fail widget if missing
    if (!W.ZZXNodesChart?.draw) {
      await loadScriptOnce(base + "chart.js", "zzx:nodes:chart");
    }

    return { ok: true };
  }

  async function update(root, core) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-nodes-sub]", "error: " + deps.why);
        return;
      }

      const url = W.ZZXNodesSources.endpoints.bitnodesLatest;
      const payload = await W.ZZXNodesFetch.fetchJSON(core, url);
      const snap = W.ZZXNodesAdapter.normalizeLatest(payload);

      setText(root, "[data-nodes-total]", fmtInt(snap.totalNodes));
      setText(root, "[data-nodes-height]", fmtInt(snap.latestHeight));

      if (Number.isFinite(snap.updatedMs) && snap.updatedMs > 0) {
        const d = new Date(snap.updatedMs);
        setText(root, "[data-nodes-updated]", d.toLocaleString());
        setText(root, "[data-nodes-sub]", "Bitnodes (latest snapshot)");
      } else {
        setText(root, "[data-nodes-updated]", "—");
        setText(root, "[data-nodes-sub]", "Bitnodes (latest snapshot)");
      }

      // Optional: record + draw mini history sparkline if you later add DOM for it
      if (W.ZZXNodesChart?.pushPoint) W.ZZXNodesChart.pushPoint(snap.totalNodes);

      const svg = root.querySelector("[data-nodes-svg]");
      if (svg && W.ZZXNodesChart?.draw) W.ZZXNodesChart.draw(svg);

    } catch (e) {
      setText(root, "[data-nodes-sub]", "error: " + String(e?.message || e));
      if (DEBUG) console.warn("[nodes]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxNodesTimer) {
      clearInterval(root.__zzxNodesTimer);
      root.__zzxNodesTimer = null;
    }

    update(root, core);

    const refreshMs = W.ZZXNodesSources?.defaults?.refreshMs || (5 * 60_000);
    root.__zzxNodesTimer = setInterval(() => update(root, core), refreshMs);
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root, core) => boot(root, core));
    return;
  }

  if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, (root, core) => boot(root, core));
  }
})();
