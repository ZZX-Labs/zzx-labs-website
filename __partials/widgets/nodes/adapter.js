// __partials/widgets/nodes/adapter.js
// DROP-IN
// Normalizes Bitnodes "latest snapshot" payload into a stable shape
// regardless of wrapper objects.
// Output:
//   { totalNodes, latestHeight, updatedMs }

(function () {
  "use strict";

  const NS = (window.ZZXNodesAdapter = window.ZZXNodesAdapter || {});

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function pickSnapshot(payload) {
    if (!payload || typeof payload !== "object") return {};

    // common wrappers
    if (payload.data && typeof payload.data === "object") return payload.data;
    if (payload.results && typeof payload.results === "object") return payload.results;
    if (payload.snapshot && typeof payload.snapshot === "object") return payload.snapshot;

    return payload;
  }

  NS.normalizeLatest = function normalizeLatest(payload) {
    const d = pickSnapshot(payload);

    const totalNodes =
      n(d?.total_nodes) ||
      n(d?.totalNodes) ||
      n(d?.nodes_total) ||
      n(d?.total) ||
      NaN;

    const latestHeight =
      n(d?.latest_height) ||
      n(d?.height) ||
      n(d?.block_height) ||
      NaN;

    // Bitnodes timestamp is usually seconds (unix epoch)
    let ts =
      n(d?.timestamp) ||
      n(d?.updated_at) ||
      n(d?.ts) ||
      NaN;

    // seconds -> ms
    if (Number.isFinite(ts) && ts > 0 && ts < 2e12) ts = ts * 1000;

    const updatedMs = Number.isFinite(ts) && ts > 0 ? ts : NaN;

    return { totalNodes, latestHeight, updatedMs };
  };
})();
