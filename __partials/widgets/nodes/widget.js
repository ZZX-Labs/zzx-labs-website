// __partials/widgets/nodes/widget.js
// DROP-IN (manifest/core compatible)
//
// - Uses allorigins RAW so Bitnodes works from static GH pages.
// - Robust text-first JSON parse with preview (fixes "unexpected character at line 1").
// - Safe reinjection (clears interval).
//
// Data source:
//   https://bitnodes.io/api/v1/snapshots/latest/
// AllOrigins RAW passthrough:
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

  function n(x){
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtInt(x) {
    const v = n(x);
    return Number.isFinite(v) ? Math.round(v).toLocaleString() : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function compactPreview(s, max = 180){
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? (t.slice(0, max) + "…") : t;
  }

  async function fetchText(u) {
    const r = await fetch(u, {
      cache: "no-store",
      redirect: "follow",
      credentials: "omit"
    });

    const t = await r.text();

    if (!r.ok) {
      throw new Error(`HTTP ${r.status}: ${compactPreview(t) || "no body"}`);
    }
    return t;
  }

  function parseJSON(text) {
    const s = String(text ?? "").trim();
    if (!s) throw new Error("empty response");
    try {
      return JSON.parse(s);
    } catch {
      // This is the key fix: show WHAT we got (HTML, rate limit, etc.)
      throw new Error(`JSON.parse failed: ${compactPreview(s) || "no preview"}`);
    }
  }

  function pickSnapshot(payload){
    // Support multiple plausible shapes without guessing:
    // A) { total_nodes, latest_height, timestamp }
    // B) { data: { ... } }
    // C) { results: { ... } }
    // D) { snapshot: { ... } }
    if (!payload || typeof payload !== "object") return {};

    if (payload.total_nodes != null || payload.latest_height != null || payload.timestamp != null) {
      return payload;
    }
    if (payload.data && typeof payload.data === "object") return payload.data;
    if (payload.results && typeof payload.results === "object") return payload.results;
    if (payload.snapshot && typeof payload.snapshot === "object") return payload.snapshot;

    return payload;
  }

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const url = allOrigins(DEFAULTS.BITNODES_LATEST);

      // Text-first so we can diagnose non-JSON responses.
      const text = await fetchText(url);
      const payload = parseJSON(text);
      const data = pickSnapshot(payload);

      const total = n(data?.total_nodes ?? data?.total ?? data?.nodes_total);
      const height = n(data?.latest_height ?? data?.height ?? data?.block_height);

      // bitnodes timestamp is typically seconds; handle ms if needed
      let ts = n(data?.timestamp ?? data?.updated_at ?? data?.ts);
      if (Number.isFinite(ts) && ts > 0 && ts < 2e12) ts = ts * 1000;

      setText(root, "[data-nodes-total]", fmtInt(total));
      setText(root, "[data-nodes-height]", fmtInt(height));

      if (Number.isFinite(ts) && ts > 0) {
        const d = new Date(ts);
        setText(root, "[data-nodes-updated]", d.toLocaleString());
        setText(root, "[data-nodes-sub]", "Bitnodes (latest snapshot via allorigins)");
      } else {
        setText(root, "[data-nodes-updated]", "—");
        setText(root, "[data-nodes-sub]", "Bitnodes (via allorigins)");
      }
    } catch (e) {
      setText(root, "[data-nodes-sub]", "error: " + String(e?.message || e));
      // keep height/updated stable instead of flashing garbage
      setText(root, "[data-nodes-updated]", "—");
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
