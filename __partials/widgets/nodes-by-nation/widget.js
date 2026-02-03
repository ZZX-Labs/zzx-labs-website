// __partials/widgets/nodes-by-nation/widget.js
// DROP-IN (FIXED: works with Bitnodes snapshot model + robust fetch)
//
// Why your current one fails:
// - allorigins often returns HTML/403/Cloudflare instead of JSON -> JSON.parse error.
// - Bitnodes country endpoints vary by deployment AND by whether you use /latest/ or /<timestamp>/.
// - Trailing slash differences sometimes matter.
//
// This version:
// - Direct fetch FIRST (like your working "Nodes" widget). AllOrigins is fallback only.
// - Text-first parsing with HTML detection + readable error snippets.
// - Tries these endpoints in order until one returns parseable JSON:
//     1) /api/v1/snapshots/latest/countries/
//     2) /api/v1/snapshots/latest/countries
//     3) /api/v1/snapshots/<timestamp>/countries/   (timestamp discovered from /snapshots/latest/)
//     4) /api/v1/snapshots/<timestamp>/countries
// - Normalizes multiple known Bitnodes shapes into rows.
// - Computes % if missing.
// - 5-per-page pager + refresh.
// - Adds light caching so the widget doesn’t hammer Bitnodes (shared across page load).
//
// No new files required.

(function () {
  "use strict";

  const W = window;
  const ID = "nodes-by-nation";

  const CFG = {
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,

    BITNODES_BASE: "https://bitnodes.io/api/v1",
    AO_RAW: "https://api.allorigins.win/raw?url=",

    TIMEOUT_MS: 25_000,
    RETRIES: 1,
    RETRY_DELAY_MS: 650,

    // localStorage last-good (per endpoint URL)
    CACHE_TTL_MS: 30 * 60_000,
    CACHE_PREFIX: "zzx:nodes-by-nation:",
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

  function iso2ToFlag(iso2) {
    const s = String(iso2 || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) return "🏳️";
    const A = 0x1F1E6;
    return String.fromCodePoint(A + (s.charCodeAt(0) - 65), A + (s.charCodeAt(1) - 65));
  }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms); });
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
    } catch {
      // ignore
    }
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
    } catch (e) {
      throw new Error(`JSON.parse failed for ${url}: ${snip(txt)}`);
    }
  }

  async function fetchJSONDirectThenAO(url, label) {
    // direct first
    try {
      const j = await fetchJSONRobust(url, label ? `${label} (direct)` : "direct");
      cacheWrite(url, j);
      return { json: j, from: "direct" };
    } catch (e1) {
      // AO fallback
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const j = await fetchJSONRobust(ao, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, j);
        return { json: j, from: "allorigins" };
      } catch (e2) {
        // last-good cache
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
    // If you already have a shared cache module, prefer it.
    if (W.ZZXBitnodesCache && typeof W.ZZXBitnodesCache.snapshotPair === "function") {
      try {
        const pair = await W.ZZXBitnodesCache.snapshotPair();
        const ts = Number(pair?.latest?.raw?.timestamp ?? pair?.latest?.stamp ?? pair?.latest?.raw?.ts);
        if (Number.isFinite(ts) && ts > 0) return ts;
      } catch (_) {}
    }

    // Otherwise fetch latest snapshot directly.
    const url = CFG.BITNODES_BASE + "/snapshots/latest/";
    const res = await fetchJSONDirectThenAO(url, "bitnodes latest snapshot");
    const ts = Number(res?.json?.timestamp ?? res?.json?.ts ?? res?.json?.time);
    return Number.isFinite(ts) && ts > 0 ? ts : NaN;
  }

  function candidateCountryUrls(ts) {
    const base = CFG.BITNODES_BASE;
    const urls = [
      base + "/snapshots/latest/countries/",
      base + "/snapshots/latest/countries",
    ];
    if (Number.isFinite(ts) && ts > 0) {
      urls.push(base + `/snapshots/${Math.trunc(ts)}/countries/`);
      urls.push(base + `/snapshots/${Math.trunc(ts)}/countries`);
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
    // Output: [{ code:"US", name:"United States", nodes: 1234, share: 0.12 }, ...]
    const out = [];

    if (!payload || typeof payload !== "object") return out;

    // Known shapes:
    // A) { countries: { "US": ["United States", 123], ... }, total_nodes: N }
    // B) { countries: { "US": { country:"United States", nodes:123, share:0.1 } } }
    // C) { results: [ { code:"US", name:"United States", nodes:123, share:0.1 }, ... ] }
    // D) [ { ... }, ... ]
    const countriesMap =
      (payload.countries && typeof payload.countries === "object" && payload.countries) ||
      (payload.data && payload.data.countries && typeof payload.data.countries === "object" && payload.data.countries) ||
      null;

    const arr =
      (Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload.data) && payload.data) ||
      (Array.isArray(payload) && payload) ||
      null;

    if (countriesMap) {
      for (const [code, v] of Object.entries(countriesMap)) {
        // v can be array ["United States", 123] or object
        let name = "";
        let nodes = NaN;
        let share = NaN;

        if (Array.isArray(v)) {
          name = String(v[0] ?? "").trim();
          nodes = toNum(v[1]);
          share = toNum(v[2]); // sometimes present
        } else if (v && typeof v === "object") {
          name = String(v.country ?? v.name ?? v.country_name ?? "").trim();
          nodes = toNum(v.nodes ?? v.count ?? v.total);
          share = toNum(v.share ?? v.pct ?? v.percent);
        }

        if (Number.isFinite(share) && share > 1) share = share / 100;

        out.push({
          code: String(code || "").trim(),
          name,
          nodes,
          share,
        });
      }
      return out;
    }

    if (arr) {
      for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const code = String(r.code ?? r.country_code ?? r.iso2 ?? r.cc ?? "").trim();
        const name = String(r.name ?? r.country ?? r.country_name ?? "").trim();
        const nodes = toNum(r.nodes ?? r.count ?? r.total);
        let share = toNum(r.share ?? r.pct ?? r.percent);
        if (Number.isFinite(share) && share > 1) share = share / 100;
        out.push({ code, name, nodes, share });
      }
      return out;
    }

    return out;
  }

  function computeTotal(payload, rows) {
    // Prefer any total field Bitnodes gives, else sum.
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
    const body = q(root, "[data-nbn-body]");
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

      const code = String(r.code || "").toUpperCase();
      const name = String(r.name || "").trim() || code || "Unknown";
      const flag = iso2ToFlag(code);

      const row = document.createElement("div");
      row.className = "zzx-nbn-row";
      row.setAttribute("role", "row");

      row.innerHTML =
        `<div class="zzx-nbn-cell" role="cell">${rank}</div>` +
        `<div class="zzx-nbn-cell" role="cell" title="${escapeHTML(name)}"><span class="zzx-nbn-flag">${flag}</span>${escapeHTML(name)}</div>` +
        `<div class="zzx-nbn-cell zzx-nbn-num" role="cell">${escapeHTML(fmtInt(r.nodes))}</div>` +
        `<div class="zzx-nbn-cell zzx-nbn-num" role="cell">${escapeHTML(fmtPct(r.share))}</div>`;

      body.appendChild(row);
    }

    setText(root, "[data-nbn-page]", `Page ${page} / ${totalPages}`);
  }

  // ---------------------------
  // Update loop
  // ---------------------------
  async function fetchCountriesPayload() {
    const ts = await getLatestSnapshotTimestamp();
    const urls = candidateCountryUrls(ts);

    let lastErr = null;
    for (let attempt = 0; attempt <= CFG.RETRIES; attempt++) {
      for (const url of urls) {
        try {
          const res = await fetchJSONDirectThenAO(url, "bitnodes countries");
          // Basic sanity: must be object/array, not empty string
          if (res && res.json && (typeof res.json === "object")) {
            return { payload: res.json, from: res.from, url, ts: Number.isFinite(ts) ? ts : NaN };
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (attempt < CFG.RETRIES) await sleep(CFG.RETRY_DELAY_MS);
    }

    throw lastErr || new Error("countries endpoint unavailable");
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-nbn-sub]", "loading…");

      const { payload, from, url, ts } = await fetchCountriesPayload();

      let rows = normalizeRows(payload)
        .filter((r) => Number.isFinite(r.nodes) && r.nodes > 0)
        .sort((a, b) => (Number(b.nodes) || 0) - (Number(a.nodes) || 0));

      const total = computeTotal(payload, rows);

      // Compute share if missing
      if (total > 0) {
        for (const r of rows) {
          if (!Number.isFinite(r.share)) r.share = r.nodes / total;
        }
      }

      state.rows = rows;

      setText(root, "[data-nbn-summary]", `${fmtInt(total)} nodes (top nations)`);
      const tsTxt = Number.isFinite(ts) ? ` • ts ${Math.trunc(ts)}` : "";
      setText(root, "[data-nbn-sub]", `Bitnodes countries (via ${from})${tsTxt}`);

      render(root, state);
    } catch (e) {
      state.rows = [];
      state.page = 1;
      render(root, state);

      setText(root, "[data-nbn-summary]", "—");
      setText(root, "[data-nbn-sub]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function wire(root, state) {
    const prev = q(root, "[data-nbn-prev]");
    const next = q(root, "[data-nbn-next]");
    const refresh = q(root, "[data-nbn-refresh]");

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

    const state = (root.__zzxNBNState = root.__zzxNBNState || { rows: [], page: 1, totalPages: 1 });

    wire(root, state);

    if (root.__zzxNBNTimer) {
      clearInterval(root.__zzxNBNTimer);
      root.__zzxNBNTimer = null;
    }

    update(root, state);
    root.__zzxNBNTimer = setInterval(() => update(root, state), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
