// __partials/widgets/nodes-by-version/widget.js
// DROP-IN (FIX: remove the bad “snapshotLatest missing timestamp” hard-fail)
//
// What was happening:
// - Your Bitnodes *snapshot* endpoints return `timestamp` (numeric) on /snapshots/<ts>/
// - But some of the other endpoints (/nodes/user_agents/, /nodes/versions/) do NOT include any timestamp
// - Your widget logic was treating “no timestamp” as an error when it fell back to snapshotLatest,
//   which is incorrect (and brittle).
//
// This version:
// - Never requires a timestamp to render.
// - Prefers /nodes/user_agents/ (fast + already aggregated).
// - Falls back to /snapshots/latest/ (and from there will still render even if stamp missing).
// - Displays “ts <timestamp>” only if present.
// - Keeps your paging/refresh behavior.
// - Does NOT depend on any “stamp required” checks.

(function () {
  "use strict";

  const W = window;
  const ID = "nodes-by-version";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }

  function setText(root, sel, text) {
    const el = q(root, sel);
    if (el) el.textContent = String(text ?? "—");
  }

  function fmtInt(x) { return Number.isFinite(x) ? Math.round(x).toLocaleString() : "—"; }
  function fmtPct(frac) { return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—"; }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) return String(Core.widgetBase(ID)).replace(/\/+$/, "") + "/";
    return "/__partials/widgets/nodes-by-version/";
  }

  async function loadOnce(url, key) {
    const existing = document.querySelector(`script[data-zzx-js="${key}"]`);
    if (existing) {
      await new Promise((r) => setTimeout(r, 0));
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

    const deps = [
      ["sources.js", "zzx:nbv:sources", () => W.ZZXNodesByVersionSources?.get],
      ["fetch.js",   "zzx:nbv:fetch",   () => W.ZZXNodesByVersionFetch?.fetchJSON],
      ["adapter.js", "zzx:nbv:adapter", () => W.ZZXNodesByVersionAdapter?.parse],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} missing` };
      await new Promise((r) => setTimeout(r, 0));
      if (!okfn()) return { ok: false, why: `${file} did not register` };
    }
    return { ok: true };
  }

  async function loadData(cfg) {
    // 1) userAgents (best)
    try {
      const rUA = await W.ZZXNodesByVersionFetch.fetchJSON(cfg.endpoints.userAgents);
      const pUA = W.ZZXNodesByVersionAdapter.parse(rUA.json);
      if (pUA.items && pUA.items.length) return { parsed: pUA, from: rUA.from, endpoint: "userAgents" };
    } catch (_) {}

    // 2) versions (optional; may 404)
    try {
      const rV = await W.ZZXNodesByVersionFetch.fetchJSON(cfg.endpoints.versions);
      const pV = W.ZZXNodesByVersionAdapter.parse(rV.json);
      if (pV.items && pV.items.length) return { parsed: pV, from: rV.from, endpoint: "versions" };
    } catch (_) {}

    // 3) snapshotLatest (will render even if no stamp)
    const rS = await W.ZZXNodesByVersionFetch.fetchJSON(cfg.endpoints.snapshotLatest);
    const pS = W.ZZXNodesByVersionAdapter.parse(rS.json);
    return { parsed: pS, from: rS.from, endpoint: "snapshotLatest" };
  }

  function render(root) {
    const cfg = root.__zzxNBVCfg;
    const pageSize = cfg.pageSize;

    const st = root.__zzxNBV || { page: 1, items: [], total: NaN, stamp: null, latestHeight: NaN };
    const items = st.items || [];
    const total = st.total;

    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    st.page = Math.min(Math.max(1, st.page || 1), pages);

    const start = (st.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);

    const body = q(root, "[data-nbv-body]");
    if (body) body.replaceChildren();

    for (let i = 0; i < slice.length; i++) {
      const rank = start + i + 1;
      const it = slice[i];
      const pct = (Number.isFinite(total) && total > 0) ? (Number(it.count) / total) : NaN;

      const row = document.createElement("div");
      row.className = "zzx-nbv-row";
      row.setAttribute("role", "row");

      row.innerHTML =
        `<div class="zzx-nbv-cell" role="cell">${rank}</div>` +
        `<div class="zzx-nbv-cell" role="cell" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</div>` +
        `<div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtInt(it.count)}</div>` +
        `<div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtPct(pct)}</div>`;

      if (body) body.appendChild(row);
    }

    setText(root, "[data-nbv-page]", `Page ${st.page} / ${pages}`);

    const summary =
      (Number.isFinite(total) ? `${fmtInt(total)} reachable` : "reachable") +
      ` • ${fmtInt(items.length)} versions`;

    setText(root, "[data-nbv-summary]", summary);

    root.__zzxNBV = st;
  }

  function wire(root) {
    const st = (root.__zzxNBV = root.__zzxNBV || { page: 1, items: [], total: NaN, stamp: null, latestHeight: NaN });

    const prev = q(root, "[data-nbv-prev]");
    const next = q(root, "[data-nbv-next]");
    const ref  = q(root, "[data-nbv-refresh]");

    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        st.page = Math.max(1, (st.page || 1) - 1);
        render(root);
      });
    }

    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        const cfg = root.__zzxNBVCfg;
        const pages = Math.max(1, Math.ceil((st.items?.length || 0) / cfg.pageSize));
        st.page = Math.min(pages, (st.page || 1) + 1);
        render(root);
      });
    }

    if (ref && ref.dataset.zzxBound !== "1") {
      ref.dataset.zzxBound = "1";
      ref.addEventListener("click", () => refresh(root));
    }
  }

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const deps = await ensureDeps();
      if (!deps.ok) {
        setText(root, "[data-nbv-sub]", `error: ${deps.why}`);
        return;
      }

      const cfg = W.ZZXNodesByVersionSources.get();
      root.__zzxNBVCfg = cfg;

      setText(root, "[data-nbv-sub]", "loading…");

      const { parsed, from, endpoint } = await loadData(cfg);

      const items = Array.isArray(parsed.items) ? parsed.items.slice() : [];
      items.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));

      root.__zzxNBV = root.__zzxNBV || { page: 1, items: [], total: NaN, stamp: null, latestHeight: NaN };
      root.__zzxNBV.items = items;
      root.__zzxNBV.total = parsed.total;
      root.__zzxNBV.stamp = parsed.stamp || null;
      root.__zzxNBV.latestHeight = parsed.latestHeight;

      render(root);

      const ts = root.__zzxNBV.stamp ? ` • ts ${root.__zzxNBV.stamp}` : "";
      const h  = Number.isFinite(root.__zzxNBV.latestHeight) ? ` • height ${fmtInt(root.__zzxNBV.latestHeight)}` : "";
      setText(root, "[data-nbv-sub]", `Bitnodes (${endpoint} via ${from})${ts}${h}`);
    } catch (e) {
      setText(root, "[data-nbv-sub]", "error: " + String(e?.message || e));
      if (DEBUG) console.warn("[nodes-by-version]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxNBVTimer) {
      clearInterval(root.__zzxNBVTimer);
      root.__zzxNBVTimer = null;
    }

    wire(root);
    refresh(root);

    const base = 10 * 60_000;
    const jitter = Math.floor(Math.random() * 9000);
    root.__zzxNBVTimer = setInterval(() => refresh(root), base + jitter);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  } else {
    if (DEBUG) console.warn("[nodes-by-version] no widget registry found");
  }
})();
