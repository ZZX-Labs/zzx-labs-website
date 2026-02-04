// __partials/widgets/deadopop/widget.js

(function () {
  "use strict";

  const W = window;
  const ID = "deadopop";

  const CFG = {
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,
    TIMEOUT_MS: 20_000,
    CACHE_TTL_MS: 10 * 60_000,
    CACHE_KEY: "zzx:deadopop:last",
    ENDPOINT_PRIMARY: "/deado.json",
    ENDPOINT_FALLBACK: null,
  };

  let inflight = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) { const el = q(root, sel); if (el) el.textContent = String(text ?? "—"); }

  function withTimeout(p, ms) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error("timeout after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  function cacheRead() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (Date.now() - obj.t) > CFG.CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch {
      return null;
    }
  }

  function cacheWrite(v) {
    try {
      localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ t: Date.now(), v }));
    } catch { }
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "same-origin", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
    try { return JSON.parse(String(t).trim()); }
    catch { throw new Error("JSON.parse failed for " + url); }
  }

  async function fetchDeado() {
    try {
      const j = await withTimeout(fetchJSON(CFG.ENDPOINT_PRIMARY), CFG.TIMEOUT_MS);
      cacheWrite(j);
      return { json: j, from: "primary" };
    } catch (e1) {
      if (CFG.ENDPOINT_FALLBACK) {
        try {
          const j = await withTimeout(fetchJSON(CFG.ENDPOINT_FALLBACK), CFG.TIMEOUT_MS);
          cacheWrite(j);
          return { json: j, from: "fallback" };
        } catch (e2) {
          const c = cacheRead();
          if (c) return { json: c, from: "cache" };
          throw new Error(String(e1?.message || e1) + " | " + String(e2?.message || e2));
        }
      }
      const c = cacheRead();
      if (c) return { json: c, from: "cache" };
      throw e1;
    }
  }

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtUSD0(v) {
    const x = n(v);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTable(root, state) {
    const body = q(root, "[data-deado-body]");
    if (!body) return;

    const rows = state.rows || [];
    const pageSize = CFG.PAGE_SIZE;

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, state.page || 1), totalPages);

    state.page = page;
    state.totalPages = totalPages;

    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    body.replaceChildren();

    for (let i = 0; i < slice.length; i++) {
      const r = slice[i];
      const rank = start + i + 1;

      const row = document.createElement("div");
      row.className = "zzx-deado-row";
      row.setAttribute("role", "row");

      const label = (r.name ? String(r.name) : String(r.id || "Unknown"));
      const peak = fmtUSD0(r.peak_market_cap_usd);

      row.innerHTML =
        `<div class="zzx-deado-cell" role="cell">${rank}</div>` +
        `<div class="zzx-deado-cell" role="cell" title="${escapeHTML(label)}">${escapeHTML(label)}</div>` +
        `<div class="zzx-deado-cell zzx-deado-num" role="cell">${escapeHTML(peak)}</div>`;

      body.appendChild(row);
    }

    setText(root, "[data-deado-page]", `Page ${page} / ${totalPages}`);
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-deado-status]", "loading");
      const { json, from } = await fetchDeado();

      const totalCount = n(json?.total_failed_coins);
      const totalMcap = n(json?.total_peak_market_cap_usd);

      const entries = Array.isArray(json?.entries) ? json.entries : [];
      const rows = entries
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: x.id,
          name: x.name,
          peak_market_cap_usd: n(x.peak_market_cap_usd),
        }))
        .filter((x) => Number.isFinite(x.peak_market_cap_usd) && x.peak_market_cap_usd > 0)
        .sort((a, b) => (b.peak_market_cap_usd || 0) - (a.peak_market_cap_usd || 0));

      state.rows = rows;

      setText(root, "[data-deado-count]", Number.isFinite(totalCount) ? Math.trunc(totalCount).toLocaleString() : "—");
      setText(root, "[data-deado-total]", Number.isFinite(totalMcap) ? fmtUSD0(totalMcap) : "—");

      const headline = Number.isFinite(totalMcap)
        ? ("dead capital (peak): " + fmtUSD0(totalMcap))
        : "dead capital (peak): —";

      setText(root, "[data-deado-headline]", headline);
      setText(root, "[data-deado-sub]", "source: " + String(from || "—"));

      renderTable(root, state);
      setText(root, "[data-deado-status]", "ok");
    } catch (e) {
      state.rows = [];
      state.page = 1;
      renderTable(root, state);

      setText(root, "[data-deado-headline]", "—");
      setText(root, "[data-deado-sub]", "error: " + String(e?.message || e));
      setText(root, "[data-deado-status]", "error");
    } finally {
      inflight = false;
    }
  }

  function wire(root, state) {
    const prev = q(root, "[data-deado-prev]");
    const next = q(root, "[data-deado-next]");
    const refresh = q(root, "[data-deado-refresh]");

    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        state.page = Math.max(1, (state.page || 1) - 1);
        renderTable(root, state);
      });
    }

    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        state.page = Math.min(state.totalPages || 1, (state.page || 1) + 1);
        renderTable(root, state);
      });
    }

    if (refresh && refresh.dataset.zzxBound !== "1") {
      refresh.dataset.zzxBound = "1";
      refresh.addEventListener("click", () => update(root, state));
    }
  }

  function boot(root) {
    if (!root) return;

    const state = (root.__zzxDeadoState = root.__zzxDeadoState || { rows: [], page: 1, totalPages: 1 });

    wire(root, state);

    if (root.__zzxDeadoTimer) {
      clearInterval(root.__zzxDeadoTimer);
      root.__zzxDeadoTimer = null;
    }

    update(root, state);
    root.__zzxDeadoTimer = setInterval(() => update(root, state), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
