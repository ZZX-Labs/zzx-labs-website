// __partials/widgets/nodes-by-version/widget.js
// DROP-IN (manifest/core compatible)
// - Uses allorigins for Bitnodes.
// - Paged listing (5 per page): version/agent, nodes, percent.
// - Idempotent; no runtime.js.

(function () {
  "use strict";

  const W = window;
  const ID = "nodes-by-version";

  const DEFAULTS = {
    // Bitnodes endpoints (best-effort; API shape can drift)
    BITNODES_VERSIONS: "https://bitnodes.io/api/v1/nodes/versions/",
    BITNODES_SNAPSHOT: "https://bitnodes.io/api/v1/snapshots/latest/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000
  };

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtPct(n) {
    return Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  // Normalize multiple possible response shapes into:
  // { total: number, items: [{ label, count }] }
  function parseVersions(payload) {
    // Known-ish patterns:
    // - { total_nodes: N, versions: { "/Satoshi:25.0.0/": 1234, ... } }
    // - { total: N, results: [[label,count], ...] }
    // - snapshot fallback: { total_nodes: N, user_agents: { ... } } (best effort)
    const out = { total: NaN, items: [] };

    if (!payload || typeof payload !== "object") return out;

    const t =
      Number(payload.total_nodes) ||
      Number(payload.total) ||
      Number(payload.count) ||
      Number(payload.total_reachable_nodes) ||
      NaN;
    if (Number.isFinite(t)) out.total = t;

    // object map
    const map =
      (payload.versions && typeof payload.versions === "object" && payload.versions) ||
      (payload.user_agents && typeof payload.user_agents === "object" && payload.user_agents) ||
      null;

    if (map) {
      for (const [k, v] of Object.entries(map)) {
        const c = Number(v);
        if (!Number.isFinite(c) || c <= 0) continue;
        out.items.push({ label: String(k), count: c });
      }
      return out;
    }

    // array patterns
    const arr =
      (Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload.data) && payload.data) ||
      (Array.isArray(payload.versions) && payload.versions) ||
      null;

    if (arr) {
      for (const row of arr) {
        if (Array.isArray(row) && row.length >= 2) {
          const label = String(row[0]);
          const count = Number(row[1]);
          if (!Number.isFinite(count) || count <= 0) continue;
          out.items.push({ label, count });
        } else if (row && typeof row === "object") {
          const label = String(row.label ?? row.version ?? row.ua ?? row.user_agent ?? "");
          const count = Number(row.count ?? row.nodes ?? row.value);
          if (!label || !Number.isFinite(count) || count <= 0) continue;
          out.items.push({ label, count });
        }
      }
    }

    return out;
  }

  async function loadData() {
    // Try versions endpoint first
    try {
      const v = await fetchJSON(allOrigins(DEFAULTS.BITNODES_VERSIONS));
      const parsed = parseVersions(v);
      if (parsed.items.length) return parsed;
    } catch (_) {}

    // Fallback to snapshot
    const s = await fetchJSON(allOrigins(DEFAULTS.BITNODES_SNAPSHOT));
    return parseVersions(s);
  }

  function render(root) {
    const state = root.__zzxNBV;
    const items = state.items || [];
    const total = state.total;

    const pages = Math.max(1, Math.ceil(items.length / DEFAULTS.PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page || 1), pages);

    const start = (state.page - 1) * DEFAULTS.PAGE_SIZE;
    const slice = items.slice(start, start + DEFAULTS.PAGE_SIZE);

    const body = root.querySelector("[data-nbv-body]");
    if (body) body.replaceChildren();

    for (let i = 0; i < slice.length; i++) {
      const rank = start + i + 1;
      const it = slice[i];
      const pct = Number.isFinite(total) && total > 0 ? (it.count / total) : NaN;

      const row = document.createElement("div");
      row.className = "zzx-nbv-row";
      row.setAttribute("role", "row");

      row.innerHTML = `
        <div class="zzx-nbv-cell" role="cell">${rank}</div>
        <div class="zzx-nbv-cell" role="cell" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</div>
        <div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtInt(it.count)}</div>
        <div class="zzx-nbv-cell zzx-nbv-num" role="cell">${fmtPct(pct)}</div>
      `;

      if (body) body.appendChild(row);
    }

    setText(root, "[data-nbv-page]", `Page ${state.page} / ${pages}`);

    const sum = Number.isFinite(total)
      ? `${fmtInt(total)} reachable • ${fmtInt(items.length)} versions`
      : `${fmtInt(items.length)} versions`;
    setText(root, "[data-nbv-summary]", sum);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  let inflight = false;

  async function refresh(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-nbv-sub]", "loading…");
      const data = await loadData();

      // Sort by count desc
      data.items.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

      root.__zzxNBV = root.__zzxNBV || { page: 1, items: [], total: NaN };
      root.__zzxNBV.items = data.items;
      root.__zzxNBV.total = data.total;

      render(root);
      setText(root, "[data-nbv-sub]", "Bitnodes (via allorigins)");
    } catch (e) {
      setText(root, "[data-nbv-sub]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
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
        const pages = Math.max(1, Math.ceil((st.items?.length || 0) / DEFAULTS.PAGE_SIZE));
        st.page = Math.min(pages, (st.page || 1) + 1);
        render(root);
      });
    }

    if (ref && ref.dataset.zzxBound !== "1") {
      ref.dataset.zzxBound = "1";
      ref.addEventListener("click", () => refresh(root));
    }
  }

  function boot(root) {
    if (!root) return;

    // clear old timer if reinjected
    if (root.__zzxNBVTimer) {
      clearInterval(root.__zzxNBVTimer);
      root.__zzxNBVTimer = null;
    }

    wire(root);
    refresh(root);
    root.__zzxNBVTimer = setInterval(() => refresh(root), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
