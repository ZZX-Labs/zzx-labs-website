// __partials/widgets/nodes-by-version/widget.js
// DROP-IN (DEBUGGED, modular)
// Requires (auto-loaded from same dir):
//   sources.js -> window.ZZXNodesByVersionSources.get()
//   fetch.js   -> window.ZZXNodesByVersionFetch.fetchJSON(url)
//   adapter.js -> window.ZZXNodesByVersionAdapter.parse(payload)
//
// Features:
// - 5/page pager
// - refresh button
// - rate-limit tolerant (uses cached last-good via fetch.js)
// - idempotent (clears intervals, binds once)

(function () {
  "use strict";

  const W = window;
  const ID = "nodes-by-version";
  const DEBUG = !!W.__ZZX_WIDGET_DEBUG;

  let inflight = false;

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function fmtInt(x) {
    return Number.isFinite(x) ? Math.round(x).toLocaleString() : "—";
  }

  function fmtPct(frac) {
    return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—";
  }

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

    const deps = [
      ["sources.js", "zzx:nbv:sources", () => W.ZZXNodesByVersionSources?.get],
      ["fetch.js",   "zzx:nbv:fetch",   () => W.ZZXNodesByVersionFetch?.fetchJSON],
      ["adapter.js", "zzx:nbv:adapter", () => W.ZZXNodesByVersionAdapter?.parse],
    ];

    for (const [file, key, okfn] of deps) {
      if (okfn()) continue;
      const ok = await loadOnce(base + file, key);
      if (!ok) return { ok: false, why: `${file} missing` };
      await new Promise(r => setTimeout(r, 0));
      if (!okfn()) return { ok: false, why: `${file} did not register` };
    }
    return { ok: true };
  }

  async function loadData(cfg) {
    // Try versions first; fallback to snapshot
    const r1 = await W.ZZXNodesByVersionFetch.fetchJSON(cfg.endpoints.versions);
    const p1 = W.ZZXNodesByVersionAdapter.parse(r1.json);
    if (p1.items && p1.items.length) return { parsed: p1, from: r1.from, endpoint: "versions" };

    const r2 = await W.ZZXNodesByVersionFetch.fetchJSON(cfg.endpoints.snapshotLatest);
    const p2 = W.ZZXNodesByVersionAdapter.parse(r2.json);
    return { parsed: p2, from: r2.from, endpoint: "snapshotLatest" };
  }

  function render(root) {
    const st = root.__zzxNBV || { page: 1, items: [], total: NaN };
    const cfg = root.__zzxNBVCfg;
    const pageSize = cfg.pageSize;

    const items = st.items || [];
    const total = st.total;

    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    st.page = Math.min(Math.max(1, st.page || 1), pages);

    const start = (st.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);

    const body = root.querySelector("[data-nbv-body]");
    if (body) body.replaceChildren();

    for (let i = 0; i < slice.length; i++) {
      const rank = start + i + 1;
      const it = slice[i];
      const pct = (Number.isFinite(total) && total > 0) ? (it.count / total) : NaN;

      const row = document.createElement("div");
      row.className = "zzx-nbv-row";
      row.setAttribute("role", "row");

      // safe HTML (escaped)
      row.innerHTML =
        `<div class="zzx-nbv-cell" role="cell">${rank}</div>` +
        `<div class="zzx-nbv-cell" role="cell" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</div>` +
        `<div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtInt(it.count)}</div>` +
        `<div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtPct(pct)}</div>`;

      if (body) body.appendChild(row);
    }

    setText(root, "[data-nbv-page]", `Page ${st.page} / ${pages}`);

    const sum = Number.isFinite(total)
      ? `${fmtInt(total)} reachable • ${fmtInt(items.length)} versions`
      : `${fmtInt(items.length)} versions`;

    setText(root, "[data-nbv-summary]", sum);

    root.__zzxNBV = st;
  }

  function wire(root) {
    const st = (root.__zzxNBV = root.__zzxNBV || { page: 1, items: [], total: NaN });

    const prev = root.querySelector("[data-nbv-prev]");
    const next = root.querySelector("[data-nbv-next]");
    const ref  = root.querySelector("[data-nbv-refresh]");

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

      // sort by count desc
      parsed.items.sort((a, b) => (b.count || 0) - (a.count || 0));

      // stash
      root.__zzxNBV = root.__zzxNBV || { page: 1, items: [], total: NaN };
      root.__zzxNBV.items = parsed.items;
      root.__zzxNBV.total = parsed.total;

      // render
      render(root);

      setText(root, "[data-nbv-sub]", `Bitnodes (${endpoint} via ${from})`);
    } catch (e) {
      setText(root, "[data-nbv-sub]", "error: " + String(e?.message || e));
      if (DEBUG) console.warn("[nodes-by-version]", e);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    // clear old timer if reinjected
    if (root.__zzxNBVTimer) {
      clearInterval(root.__zzxNBVTimer);
      root.__zzxNBVTimer = null;
    }

    // deps + config
    wire(root);
    refresh(root);

    // refresh with slight jitter
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
