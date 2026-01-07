// __partials/widgets/hashrate-by-nation/widget.js
// DROP-IN (manifest/core compatible; paged 5 per page)
//
// Uses ONLY a same-directory dataset:
//   __partials/widgets/hashrate-by-nation/hashrate-by-nation.json
//
// No other paths. No extra routes. No runtime dependency.

(function () {
  "use strict";

  const W = window;

  const ID = "hashrate-by-nation";

  const DEFAULTS = {
    DATA_JSON: "./hashrate-by-nation.json",
    PAGE_SIZE: 5,
    DEFAULT_J_PER_TH: 30, // used if power_w not provided
    REFRESH_MS: 10 * 60_000
  };

  let inflight = false;

  function fmtNum(n, digits = 2) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "—";
  }

  function fmtPct(n, digits = 1) {
    return Number.isFinite(n) ? `${fmtNum(n, digits)}%` : "—";
  }

  function flagFromCode(code) {
    const c = String(code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return "";
    const A = 0x1F1E6;
    const base = "A".charCodeAt(0);
    return String.fromCodePoint(A + (c.charCodeAt(0) - base), A + (c.charCodeAt(1) - base));
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getJPerTH() {
    const v = W.ZZX_MINING && Number(W.ZZX_MINING.J_PER_TH);
    return Number.isFinite(v) && v > 0 ? v : DEFAULTS.DEFAULT_J_PER_TH;
  }

  function estimatePowerW(hashrateZH, jPerTH) {
    // TH/s = ZH/s * 1e9; W = TH/s * J/TH
    const zh = Number(hashrateZH);
    if (!Number.isFinite(zh)) return NaN;
    return zh * 1e9 * jPerTH;
  }

  async function fetchJSONSameDir(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function clearBody(root) {
    const body = root.querySelector("[data-hbn-body]");
    if (body) body.replaceChildren();
    return body;
  }

  function rowEl(D, idx, item, totalZH, jPerTH) {
    const zh = Number(item.hashrate_zh);
    const pct = Number.isFinite(zh) && Number.isFinite(totalZH) && totalZH > 0 ? (zh / totalZH) * 100 : NaN;

    const powerW = Number.isFinite(Number(item.power_w))
      ? Number(item.power_w)
      : estimatePowerW(zh, jPerTH);

    const powerGW = Number.isFinite(powerW) ? (powerW / 1e9) : NaN;

    const code = item.code || item.cc || item.iso2 || "";
    const flag = flagFromCode(code);
    const nation = String(item.nation || item.name || "—");

    const r = D.createElement("div");
    r.className = "zzx-hbn-row";
    r.setAttribute("role", "row");
    r.setAttribute("data-hbn-row", "1");

    r.innerHTML = `
      <div class="zzx-hbn-cell" role="cell">${idx}</div>
      <div class="zzx-hbn-cell" role="cell">${flag ? `${flag} ` : ""}${escapeHTML(nation)}</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">${Number.isFinite(zh) ? `${fmtNum(zh, 2)} ZH/s` : "—"}</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">${Number.isFinite(powerGW) ? `${fmtNum(powerGW, 2)} GW` : "—"}</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">${fmtPct(pct, 1)}</div>
    `;
    return r;
  }

  function renderNoData(root, msg) {
    setText(root, "[data-hbn-summary]", "No dataset");
    setText(root, "[data-hbn-sub]", msg || "hashrate-by-nation.json missing or empty.");
    const body = clearBody(root);
    if (!body) return;

    const D = document;
    const r = D.createElement("div");
    r.className = "zzx-hbn-row";
    r.setAttribute("role", "row");
    r.setAttribute("data-hbn-row", "1");
    r.innerHTML = `
      <div class="zzx-hbn-cell" role="cell">—</div>
      <div class="zzx-hbn-cell" role="cell">${escapeHTML(msg || "No data source configured.")}</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">—</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">—</div>
      <div class="zzx-hbn-cell zzx-hbn-num" role="cell">—</div>
    `;
    body.appendChild(r);
    setText(root, "[data-hbn-page]", "Page 1 / 1");
  }

  function wirePager(root, state) {
    const prev = root.querySelector("[data-hbn-prev]");
    const next = root.querySelector("[data-hbn-next]");
    const ref  = root.querySelector("[data-hbn-refresh]");

    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        state.page = clamp(state.page - 1, 1, state.pages);
        renderPage(root, state);
      });
    }

    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        state.page = clamp(state.page + 1, 1, state.pages);
        renderPage(root, state);
      });
    }

    if (ref && ref.dataset.zzxBound !== "1") {
      ref.dataset.zzxBound = "1";
      ref.addEventListener("click", () => state.refresh());
    }
  }

  function renderPage(root, state) {
    const D = document;
    const body = clearBody(root);
    if (!body) return;

    const start = (state.page - 1) * state.pageSize;
    const slice = state.rows.slice(start, start + state.pageSize);

    slice.forEach((item, i) => {
      const idx = start + i + 1;
      body.appendChild(rowEl(D, idx, item, state.totalZH, state.jPerTH));
    });

    setText(root, "[data-hbn-page]", `Page ${state.page} / ${state.pages}`);
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      let data;
      try {
        data = await fetchJSONSameDir(DEFAULTS.DATA_JSON);
      } catch (e) {
        renderNoData(root, `Failed to load ${DEFAULTS.DATA_JSON} (${String(e?.message || e)})`);
        return;
      }

      const rows = Array.isArray(data?.rows) ? data.rows.slice() : [];
      if (!rows.length) {
        renderNoData(root, "Dataset loaded but rows[] is empty.");
        return;
      }

      rows.sort((a, b) => (Number(b.hashrate_zh) || 0) - (Number(a.hashrate_zh) || 0));

      const totalZH =
        Number.isFinite(Number(data?.total_hashrate_zh))
          ? Number(data.total_hashrate_zh)
          : rows.reduce((s, r) => s + (Number(r.hashrate_zh) || 0), 0);

      state.rows = rows;
      state.totalZH = totalZH;
      state.jPerTH = getJPerTH();
      state.pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      state.page = clamp(state.page, 1, state.pages);

      setText(root, "[data-hbn-summary]", `Top nations: ${rows.length} • Total: ${fmtNum(totalZH, 2)} ZH/s`);
      setText(root, "[data-hbn-sub]", data?.updated ? `Updated: ${String(data.updated)}` : "hashrate-by-nation.json");

      renderPage(root, state);
    } finally {
      inflight = false;
    }
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxHbnTimer) {
      clearInterval(root.__zzxHbnTimer);
      root.__zzxHbnTimer = null;
    }

    const state = {
      pageSize: DEFAULTS.PAGE_SIZE,
      page: 1,
      pages: 1,
      rows: [],
      totalZH: NaN,
      jPerTH: getJPerTH(),
      refresh: () => update(root, state),
    };

    wirePager(root, state);

    update(root, state);
    root.__zzxHbnTimer = setInterval(() => update(root, state), DEFAULTS.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
