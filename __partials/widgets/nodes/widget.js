// __partials/widgets/nodes/widget.js
// DROP-IN (manifest/core compatible)
//
// Requirements met:
// - Uses allorigins so Bitnodes calls work from static GH pages.
// - No runtime.js dependency.
// - No new routes/files.
// - Safe if reinjected (clears interval).
//
// Data source:
//   Bitnodes latest snapshot: https://bitnodes.io/api/v1/snapshots/latest/
//
// Through allorigins RAW passthrough:
//   https://api.allorigins.win/raw?url=<encoded>

(function () {
  "use strict";

  const W = window;

  const ID = "nodes";

  const DEFAULTS = {
    BITNODES_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    REFRESH_MS: 5 * 60_000
  };

  let inflight = false;

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const url = allOrigins(DEFAULTS.BITNODES_LATEST);
      const data = await fetchJSON(url);

      const total = Number(data?.total_nodes);
      const height = Number(data?.latest_height);
      const ts = Number(data?.timestamp);

      setText(root, "[data-nodes-total]", fmtInt(total));
      setText(root, "[data-nodes-height]", fmtInt(height));

      if (Number.isFinite(ts) && ts > 0) {
        const d = new Date(ts * 1000);
        setText(root, "[data-nodes-updated]", d.toLocaleString());
        setText(root, "[data-nodes-sub]", "Bitnodes (latest snapshot via allorigins)");
      } else {
        setText(root, "[data-nodes-updated]", "—");
        setText(root, "[data-nodes-sub]", "Bitnodes (via allorigins)");
      }
    } catch (e) {
      setText(root, "[data-nodes-sub]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    // avoid double intervals if reinjected
    if (root.__zzxNodesTimer) {
      clearInterval(root.__zzxNodesTimer);
      root.__zzxNodesTimer = null;
    }

    update(root);
    root.__zzxNodesTimer = setInterval(() => update(root), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
