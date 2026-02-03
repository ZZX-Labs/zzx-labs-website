// __partials/widgets/nodes-by-city/widget.js
// DROP-IN (mirror of nodes-by-nation, but for cities)
//
// Key behavior:
// - Direct fetch first; AllOrigins fallback only.
// - Text-first parsing with HTML detection for the classic "JSON.parse unexpected <" failures.
// - Tries endpoints in order (Bitnodes deployments vary):
//     1) /api/v1/snapshots/latest/cities/
//     2) /api/v1/snapshots/latest/cities
//     3) /api/v1/snapshots/<timestamp>/cities/
//     4) /api/v1/snapshots/<timestamp>/cities
// - Normalizes multiple shapes into rows.
// - Computes % if missing.
// - 5/page pager + refresh, idempotent on reinjection.
// - Light last-good caching (localStorage) to avoid hammering Bitnodes.

(function () {
  "use strict";

  const W = window;
  const ID = "nodes-by-city";

  const CFG = {
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,

    BITNODES_BASE: "https://bitnodes.io/api/v1",
    AO_RAW: "https://api.allorigins.win/raw?url=",

    TIMEOUT_MS: 25_000,
    RETRIES: 1,
    RETRY_DELAY_MS: 650,

    CACHE_TTL_MS: 30 * 60_000,
    CACHE_PREFIX: "zzx:nodes-by-city:",
  };

  let inflight = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) { const el = q(root, sel); if (el) el.textContent = String(text ?? "—"); }

  function fmtInt(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"; }
  function fmtPct(frac) { return Number.isFinite(frac) ? (frac * 100).toFixed(2) + "%" : "—"; }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function snip(s, n = 180) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function looksLikeHTML(text) {
    const s = String(text || "").trim().toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body");
  }

  function cacheKey(url) {
    return CFG.CACHE_PREFIX + encodeURIComponent(String(url || ""));
  }

  function cacheRead(url) {
    try {
      const raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (Date.now() - obj.t) > CFG.CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch {
      return null;
    }
  }

  function cacheWrite(url, value) {
    try {
      localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), v: value }));
    } catch { /* ignore */ }
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} for ${url}: ${snip(t) || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  async function fetchJSONRobust(url, label) {
    const txt = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label || "fetch");
    if (looksLikeHTML(txt)) throw new Error(`Non-JSON (HTML) from ${url}: ${snip(txt)}`);
    try {
      return JSON.parse(String(txt).trim());
    } catch {
      throw new Error(`JSON.parse failed for ${url}: ${snip(txt)}`);
    }
  }

  async function fetchJSONDirectThenAO(url, label) {
    try {
      const j = await fetchJSONRobust(url, label ? `${label} (direct)` : "direct");
      cacheWrite(url, j);
      return { json: j, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const j = await fetchJSONRobust(ao, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, j);
        return { json: j, from: "allorigins" };
      } catch (e2) {
        const cached = cacheRead(url);
        if (cached != null) return { json: cached, from: "cache" };
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  // ---------------------------
  // Endpoint discovery
  // ---------------------------
  async function getLatestSnapshotTimestamp() {
    // Prefer your shared cache if present
    if (W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function") {
      try {
        const pair = await W.ZZXBitnodesCache.snapshotPair();
        const rawTs = pair?.latest?.raw?.timestamp ?? pair?.latest?.raw?.ts ?? pair?.latest?.stamp;
        const ts = Number(rawTs);
        if (Number.isFinite(ts) && ts > 0) return ts;
      } catch (_) {}
    }

    // Otherwise fetch latest snapshot directly
    const url = CFG.BITNODES_BASE + "/snapshots/latest/";
    const res = await fetchJSONDirectThenAO(url, "bitnodes latest snapshot");
    const ts = Number(res?.json?.timestamp ?? res?.json?.ts ?? res?.json?.time);
    return Number.isFinite(ts) && ts > 0 ? ts : NaN;
  }

  function candidateCityUrls(ts) {
    const base = CFG.BITNODES_BASE;
    const urls = [
      base + "/snapshots/latest/cities/",
      base + "/snapshots/latest/cities",
    ];
    if (Number.isFinite(ts) && ts > 0) {
      urls.push(base + `/snapshots/${Math.trunc(ts)}/cities/`);
      urls.push(base + `/snapshots/${Math.trunc(ts)}/cities`);
    }
    return urls;
  }

  // ---------------------------
  // Normalization
  // ---------------------------
  function toNum(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function normalizeRows(payload) {
    // Output: [{ label:"City, CC" | "City", nodes:N, share:0-1 }, ...]
    const out = [];
    if (!payload || typeof payload !== "object") return out;

    // Known-ish shapes observed across Bitnodes variants:
    // A) { cities: { "New York": { nodes:123, country:"US", share:0.01 } , ... } }
    // B) { cities: { "New York, US": 123, ... } } (rare)
    // C) { results: [ { city:"New York", country:"US", nodes:123, share:0.01 }, ... ] }
    // D) [ { ... }, ... ]
    const citiesMap =
      (payload.cities && typeof payload.cities === "object" && payload.cities) ||
      (payload.data && payload.data.cities && typeof payload.data.cities === "object" && payload.data.cities) ||
      null;

    const arr =
      (Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload.data) && payload.data) ||
      (Array.isArray(payload) && payload) ||
      null;

    if (citiesMap) {
      for (const [k, v] of Object.entries(citiesMap)) {
        let city = "";
        let cc = "";
        let nodes = NaN;
        let share = NaN;

        if (typeof v === "number") {
          city = String(k ?? "").trim();
          nodes = toNum(v);
        } else if (Array.isArray(v)) {
          // possible: ["US", 123] or ["New York", "US", 123]
          if (v.length === 2) {
            cc = String(v[0] ?? "").trim();
            nodes = toNum(v[1]);
            city = String(k ?? "").trim();
          } else if (v.length >= 3) {
            city = String(v[0] ?? k ?? "").trim();
            cc = String(v[1] ?? "").trim();
            nodes = toNum(v[2]);
            share = toNum(v[3]);
          }
        } else if (v && typeof v === "object") {
          city = String(v.city ?? v.name ?? v.location ?? k ?? "").trim();
          cc = String(v.country ?? v.country_code ?? v.cc ?? v.iso2 ?? "").trim();
          nodes = toNum(v.nodes ?? v.count ?? v.total);
          share = toNum(v.share ?? v.pct ?? v.percent);
        }

        if (Number.isFinite(share) && share > 1) share = share / 100;

        const label = cc ? `${city}, ${String(cc).toUpperCase()}` : city;
        out.push({ label: label || String(k || "Unknown"), nodes, share });
      }
      return out;
    }

    if (arr) {
      for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const city = String(r.city ?? r.name ?? r.location ?? "").trim();
        const cc = String(r.country ?? r.country_code ?? r.cc ?? r.iso2 ?? "").trim();
        const nodes = toNum(r.nodes ?? r.count ?? r.total);
        let share = toNum(r.share ?? r.pct ?? r.percent);
        if (Number.isFinite(share) && share > 1) share = share / 100;

        const label = (city && cc) ? `${city}, ${cc.toUpperCase()}` : (city || cc || "Unknown");
        out.push({ label, nodes, share });
      }
      return out;
    }

    return out;
  }

  function computeTotal(payload, rows) {
    const p = payload || {};
    const t =
      toNum(p.total_nodes) ||
      toNum(p.total) ||
      toNum(p.nodes) ||
      toNum(p.total_count) ||
      NaN;

    if (Number.isFinite(t) && t > 0) return t;
    return rows.reduce((s, r) => s + (Number.isFinite(r.nodes) ? r.nodes : 0), 0);
  }

  // ---------------------------
  // Render
  // ---------------------------
  function render(root, state) {
    const body = q(root, "[data-nbc-body]");
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
      row.className = "zzx-nbc-row";
      row.setAttribute("role", "row");

      row.innerHTML =
        `<div class="zzx-nbc-cell" role="cell">${rank}</div>` +
        `<div class="zzx-nbc-cell" role="cell" title="${escapeHTML(r.label)}">${escapeHTML(r.label)}</div>` +
        `<div class="zzx-nbc-cell zzx-nbc-num" role="cell">${escapeHTML(fmtInt(r.nodes))}</div>` +
        `<div class="zzx-nbc-cell zzx-nbc-num" role="cell">${escapeHTML(fmtPct(r.share))}</div>`;

      body.appendChild(row);
    }

    setText(root, "[data-nbc-page]", `Page ${page} / ${totalPages}`);
  }

  // ---------------------------
  // Update loop
  // ---------------------------
  async function fetchCitiesPayload() {
    const ts = await getLatestSnapshotTimestamp();
    const urls = candidateCityUrls(ts);

    let lastErr = null;
    for (let attempt = 0; attempt <= CFG.RETRIES; attempt++) {
      for (const url of urls) {
        try {
          const res = await fetchJSONDirectThenAO(url, "bitnodes cities");
          if (res && res.json && typeof res.json === "object") {
            return { payload: res.json, from: res.from, url, ts: Number.isFinite(ts) ? ts : NaN };
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (attempt < CFG.RETRIES) await sleep(CFG.RETRY_DELAY_MS);
    }

    throw lastErr || new Error("cities endpoint unavailable");
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-nbc-sub]", "loading…");

      const { payload, from, ts } = await fetchCitiesPayload();

      let rows = normalizeRows(payload)
        .filter((r) => Number.isFinite(r.nodes) && r.nodes > 0)
        .sort((a, b) => (Number(b.nodes) || 0) - (Number(a.nodes) || 0));

      const total = computeTotal(payload, rows);

      if (total > 0) {
        for (const r of rows) {
          if (!Number.isFinite(r.share)) r.share = r.nodes / total;
        }
      }

      state.rows = rows;

      setText(root, "[data-nbc-summary]", `${fmtInt(total)} nodes (top cities)`);
      const tsTxt = Number.isFinite(ts) ? ` • ts ${Math.trunc(ts)}` : "";
      setText(root, "[data-nbc-sub]", `Bitnodes cities (via ${from})${tsTxt}`);

      render(root, state);
    } catch (e) {
      state.rows = [];
      state.page = 1;
      render(root, state);

      setText(root, "[data-nbc-summary]", "—");
      setText(root, "[data-nbc-sub]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function wire(root, state) {
    const prev = q(root, "[data-nbc-prev]");
    const next = q(root, "[data-nbc-next]");
    const refresh = q(root, "[data-nbc-refresh]");

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

    const state = (root.__zzxNBCState = root.__zzxNBCState || { rows: [], page: 1, totalPages: 1 });

    wire(root, state);

    if (root.__zzxNBCTimer) {
      clearInterval(root.__zzxNBCTimer);
      root.__zzxNBCTimer = null;
    }

    update(root, state);
    root.__zzxNBCTimer = setInterval(() => update(root, state), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
