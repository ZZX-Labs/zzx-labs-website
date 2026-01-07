// __partials/widgets/nodes-by-nation/widget.js
// DROP-IN (manifest/core compatible)
//
// Requirements met:
// - Uses allorigins for Bitnodes API.
// - Paged list: 5 per page.
// - Safe if reinjected (clears interval, rebinds buttons idempotently).
// - No runtime.js, no new routes/files.
//
// NOTE:
// Bitnodes country endpoint naming can vary. Default is:
//   https://bitnodes.io/api/v1/snapshots/latest/countries/
// If that 404s, the widget will show an error in the subline.
// (You can swap the endpoint string without changing any other logic.)

(function () {
  "use strict";

  const W = window;

  const ID = "nodes-by-nation";

  const DEFAULTS = {
    BITNODES_COUNTRIES: "https://bitnodes.io/api/v1/snapshots/latest/countries/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000
  };

  let inflight = false;

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function fmtPct(x) {
    if (!Number.isFinite(x)) return "—";
    return (x * 100).toFixed(2) + "%";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function iso2ToFlag(iso2) {
    const s = String(iso2 || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) return "🏳️";
    const A = 0x1F1E6;
    const cp1 = A + (s.charCodeAt(0) - 65);
    const cp2 = A + (s.charCodeAt(1) - 65);
    return String.fromCodePoint(cp1, cp2);
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function normalizeRows(payload) {
    // Goal: [{ code:"US", name:"United States", nodes:1234, share:0.12 }, ...]
    //
    // We tolerate different shapes:
    // - payload.countries: { US: { country:"United States", nodes:123 }, ... }
    // - payload.results: [...]
    // - payload: [...]
    const out = [];

    const src =
      (payload && payload.countries && typeof payload.countries === "object" && payload.countries) ||
      (payload && payload.results && Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload) ? payload : null);

    if (!src) return out;

    if (Array.isArray(src)) {
      for (const r of src) {
        const code = r?.code || r?.country_code || r?.iso2 || r?.cc;
        const name = r?.name || r?.country || r?.country_name;
        const nodes = Number(r?.nodes ?? r?.count ?? r?.total);
        // share might come as 0-1 or 0-100; detect > 1 means percent
        let share = Number(r?.share ?? r?.pct ?? r?.percent);
        if (Number.isFinite(share) && share > 1) share = share / 100;
        out.push({ code, name, nodes, share });
      }
      return out;
    }

    // object map case
    for (const [code, v] of Object.entries(src)) {
      const name = v?.country || v?.name || v?.country_name;
      const nodes = Number(v?.nodes ?? v?.count ?? v?.total);
      let share = Number(v?.share ?? v?.pct ?? v?.percent);
      if (Number.isFinite(share) && share > 1) share = share / 100;
      out.push({ code, name, nodes, share });
    }
    return out;
  }

  function render(root, state) {
    const body = root.querySelector("[data-nbn-body]");
    if (!body) return;

    const rows = state.rows || [];
    const pageSize = DEFAULTS.PAGE_SIZE;

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, state.page || 1), totalPages);

    state.page = page;
    state.totalPages = totalPages;

    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    body.textContent = "";

    for (let i = 0; i < slice.length; i++) {
      const r = slice[i];
      const rank = start + i + 1;

      const code = String(r.code || "").toUpperCase();
      const name = String(r.name || "").trim() || code || "Unknown";
      const flag = iso2ToFlag(code);

      const row = document.createElement("div");
      row.className = "zzx-nbn-row";
      row.setAttribute("role", "row");

      row.innerHTML = `
        <div class="zzx-nbn-cell" role="cell">${rank}</div>
        <div class="zzx-nbn-cell" role="cell"><span class="zzx-nbn-flag">${flag}</span>${escapeHTML(name)}</div>
        <div class="zzx-nbn-cell zzx-nbn-num" role="cell">${escapeHTML(fmtInt(r.nodes))}</div>
        <div class="zzx-nbn-cell zzx-nbn-num" role="cell">${escapeHTML(fmtPct(r.share))}</div>
      `;

      body.appendChild(row);
    }

    setText(root, "[data-nbn-page]", `Page ${page} / ${totalPages}`);
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const url = allOrigins(DEFAULTS.BITNODES_COUNTRIES);
      const data = await fetchJSON(url);

      let rows = normalizeRows(data)
        .filter((r) => Number.isFinite(r.nodes) && r.nodes > 0)
        .sort((a, b) => (b.nodes ?? 0) - (a.nodes ?? 0));

      // If share missing, compute from total
      const total = rows.reduce((s, r) => s + (Number.isFinite(r.nodes) ? r.nodes : 0), 0);
      for (const r of rows) {
        if (!Number.isFinite(r.share) && total > 0) r.share = r.nodes / total;
      }

      state.rows = rows;

      setText(root, "[data-nbn-summary]", `${fmtInt(total)} nodes (top nations)`);
      setText(root, "[data-nbn-sub]", "Bitnodes countries (via allorigins)");

      // keep page if possible
      render(root, state);
    } catch (e) {
      setText(root, "[data-nbn-summary]", "—");
      setText(root, "[data-nbn-sub]", "error: " + String(e?.message || e));
      state.rows = [];
      state.page = 1;
      render(root, state);
    } finally {
      inflight = false;
    }
  }

  function wire(root, state) {
    const prev = root.querySelector("[data-nbn-prev]");
    const next = root.querySelector("[data-nbn-next]");
    const refresh = root.querySelector("[data-nbn-refresh]");

    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        state.page = Math.max(1, (state.page || 1) - 1);
        render(root, state);
      });
    }

    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        state.page = Math.min(state.totalPages || 1, (state.page || 1) + 1);
        render(root, state);
      });
    }

    if (refresh && refresh.dataset.zzxBound !== "1") {
      refresh.dataset.zzxBound = "1";
      refresh.addEventListener("click", () => update(root, state));
    }
  }

  function boot(root) {
    if (!root) return;

    // per-root state (survives reinjection)
    const state = { rows: [], page: 1, totalPages: 1 };
    root.__zzxNBNState = state;

    wire(root, state);

    // avoid double intervals if reinjected
    if (root.__zzxNBNTimer) {
      clearInterval(root.__zzxNBNTimer);
      root.__zzxNBNTimer = null;
    }

    update(root, state);
    root.__zzxNBNTimer = setInterval(() => update(root, state), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
