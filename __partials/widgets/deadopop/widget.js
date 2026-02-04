// __partials/widgets/deadopop/widget.js
// Client-native version of deadopop.py + deado.py behavior.
//
// Key fixes for GitHub Pages:
// - DO NOT fetch "/deado.json" on project pages; it points to domain root.
// - Use base-relative URLs via new URL("deado.json", document.baseURI)
//
// Also improves:
// - "dead coin" detection (market_cap.usd === 0)
// - peak estimate uses total_supply OR circulating_supply (fallback)
// - exports a repo-publishable deado.json
// - persists dataset to CFG.DATA_KEY = "zzx:deadopop:dataset"

(function () {
  "use strict";

  const W = window;
  const ID = "deadopop";

  const CFG = {
    COINGECKO_BASE: "https://api.coingecko.com/api/v3",
    AO_RAW: "https://api.allorigins.win/raw?url=",

    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,

    TIMEOUT_MS: 25_000,

    REQUEST_DELAY_MS: 1250,
    RATE_LIMIT_SLEEP_MS: 60_000,

    DATA_KEY: "zzx:deadopop:dataset",
    PROGRESS_KEY: "zzx:deadopop:progress",

    EXPORT_FILENAME: "deado.json",
  };

  let inflight = false;
  let scanStopRequested = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) {
    const el = q(root, sel);
    if (el) el.textContent = String(text ?? "—");
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

  function assetUrl(rel) {
    // Works for both:
    // - https://username.github.io/repo/
    // - https://custom-domain/
    return new URL(String(rel || ""), document.baseURI).toString();
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
    return { status: r.status, text: t };
  }

  async function fetchJSONRobust(url, label) {
    const { text } = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label || "fetch");
    if (looksLikeHTML(text)) throw new Error(`Non-JSON (HTML) from ${url}: ${snip(text)}`);
    try {
      return JSON.parse(String(text).trim());
    } catch {
      throw new Error(`JSON.parse failed for ${url}: ${snip(text)}`);
    }
  }

  async function fetchJSONDirectThenAO(url, label) {
    try {
      const j = await fetchJSONRobust(url, label ? `${label} (direct)` : "direct");
      return { json: j, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const j = await fetchJSONRobust(ao, label ? `${label} (allorigins)` : "allorigins");
        return { json: j, from: "allorigins" };
      } catch (e2) {
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  function toNum(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmtUSD0(n) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function fmtInt(n) {
    const x = toNum(n);
    if (!Number.isFinite(x)) return "—";
    return Math.trunc(x).toLocaleString();
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sumPeak(entries) {
    let s = 0;
    for (const e of entries) {
      const v = toNum(e?.peak_market_cap_usd);
      if (Number.isFinite(v) && v > 0) s += v;
    }
    return s;
  }

  function normalizeDataset(obj) {
    const entries = Array.isArray(obj?.entries) ? obj.entries : [];
    const total = toNum(obj?.total_peak_market_cap_usd);
    const count = toNum(obj?.total_failed_coins);

    const fixedEntries = entries
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: String(x.id || "").trim(),
        symbol: String(x.symbol || "").trim(),
        name: String(x.name || "").trim(),
        peak_market_cap_usd: Number.isFinite(toNum(x.peak_market_cap_usd)) ? Number(toNum(x.peak_market_cap_usd)) : 0,
      }))
      .filter((x) => x.id && x.peak_market_cap_usd > 0);

    const peakSum = sumPeak(fixedEntries);
    const fixed = {
      total_failed_coins: Number.isFinite(count) ? Math.trunc(count) : fixedEntries.length,
      total_peak_market_cap_usd: Number.isFinite(total) ? total : peakSum,
      entries: fixedEntries,
    };

    // Ensure totals are consistent even if older data was malformed
    fixed.total_failed_coins = fixed.entries.length;
    fixed.total_peak_market_cap_usd = Number(peakSum.toFixed(2));
    return fixed;
  }

  function loadDataset() {
    try {
      const raw = localStorage.getItem(CFG.DATA_KEY);
      if (!raw) return normalizeDataset({ entries: [] });
      return normalizeDataset(JSON.parse(raw));
    } catch {
      return normalizeDataset({ entries: [] });
    }
  }

  function saveDataset(ds) {
    try { localStorage.setItem(CFG.DATA_KEY, JSON.stringify(normalizeDataset(ds))); }
    catch { }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(CFG.PROGRESS_KEY);
      if (!raw) return { idx: 0, scanned: 0, last_id: "" };
      const obj = JSON.parse(raw);
      return {
        idx: Number.isFinite(toNum(obj?.idx)) ? Math.trunc(toNum(obj.idx)) : 0,
        scanned: Number.isFinite(toNum(obj?.scanned)) ? Math.trunc(toNum(obj.scanned)) : 0,
        last_id: String(obj?.last_id || ""),
      };
    } catch {
      return { idx: 0, scanned: 0, last_id: "" };
    }
  }

  function saveProgress(p) {
    try { localStorage.setItem(CFG.PROGRESS_KEY, JSON.stringify(p)); }
    catch { }
  }

  function ensureControls(root) {
    const pager = q(root, ".zzx-deado-pager") || root;

    let scanBtn = q(root, "[data-deado-scan]");
    let stopBtn = q(root, "[data-deado-stop]");
    let exportBtn = q(root, "[data-deado-export]");

    if (!scanBtn) {
      scanBtn = document.createElement("button");
      scanBtn.type = "button";
      scanBtn.className = "zzx-widgets__btn";
      scanBtn.setAttribute("data-deado-scan", "");
      scanBtn.textContent = "Scan";
      pager.appendChild(scanBtn);
    }

    if (!stopBtn) {
      stopBtn = document.createElement("button");
      stopBtn.type = "button";
      stopBtn.className = "zzx-widgets__btn";
      stopBtn.setAttribute("data-deado-stop", "");
      stopBtn.textContent = "Stop";
      pager.appendChild(stopBtn);
    }

    if (!exportBtn) {
      exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "zzx-widgets__btn";
      exportBtn.setAttribute("data-deado-export", "");
      exportBtn.textContent = "Export";
      pager.appendChild(exportBtn);
    }

    return { scanBtn, stopBtn, exportBtn };
  }

  function computeRows(ds) {
    const entries = Array.isArray(ds.entries) ? ds.entries : [];
    return entries
      .map((x) => ({
        id: x.id,
        name: x.name,
        peak_market_cap_usd: toNum(x.peak_market_cap_usd),
      }))
      .filter((x) => Number.isFinite(x.peak_market_cap_usd) && x.peak_market_cap_usd > 0)
      .sort((a, b) => (b.peak_market_cap_usd || 0) - (a.peak_market_cap_usd || 0));
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

  function renderSummary(root, ds, from) {
    const count = (ds.entries || []).length;
    const total = sumPeak(ds.entries || []);
    setText(root, "[data-deado-count]", fmtInt(count));
    setText(root, "[data-deado-total]", fmtUSD0(total));
    setText(root, "[data-deado-headline]", `dead capital (peak): ${fmtUSD0(total)}`);
    setText(root, "[data-deado-sub]", from || "local");
  }

  async function fetchCoinsList() {
    const url = CFG.COINGECKO_BASE + "/coins/list";
    const res = await fetchJSONDirectThenAO(url, "coingecko coins list");
    const arr = Array.isArray(res.json) ? res.json : [];
    return { coins: arr, from: res.from };
  }

  function isDeadByMarketCapUSD(coinJson) {
    // CoinGecko: market_data.market_cap.usd can be 0, null, undefined.
    const v = coinJson?.market_data?.market_cap?.usd;
    if (v === 0) return true;
    if (typeof v === "string" && v.trim() === "0") return true;
    return false;
  }

  function estimatePeakMarketCapUSD(coinJson) {
    if (!coinJson || typeof coinJson !== "object") return 0;

    if (!isDeadByMarketCapUSD(coinJson)) return 0;

    const md = coinJson.market_data || {};
    const ath = toNum(md?.ath?.usd);

    // total_supply is often null; circulating_supply is often present
    const totalSupply = toNum(md?.total_supply);
    const circSupply = toNum(md?.circulating_supply);

    const supply = (Number.isFinite(totalSupply) && totalSupply > 0)
      ? totalSupply
      : ((Number.isFinite(circSupply) && circSupply > 0) ? circSupply : NaN);

    if (Number.isFinite(ath) && ath > 0 && Number.isFinite(supply) && supply > 0) {
      return ath * supply;
    }
    return 0;
  }

  async function fetchCoin(coinId) {
    const url = CFG.COINGECKO_BASE +
      "/coins/" + encodeURIComponent(String(coinId)) +
      "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";

    try {
      const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
      const txt = await r.text();
      if (r.status === 429) {
        const err = new Error("429");
        err.status = 429;
        throw err;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${snip(txt)}`);
      if (looksLikeHTML(txt)) throw new Error("Non-JSON response");
      return JSON.parse(String(txt).trim());
    } catch (e) {
      if (String(e?.status || "") === "429" || String(e?.message || "").includes("429")) {
        const err = new Error("429");
        err.status = 429;
        throw err;
      }
      const ao = CFG.AO_RAW + encodeURIComponent(url);
      return await fetchJSONRobust(ao, "coingecko coin allorigins");
    }
  }

  function exportDataset(ds) {
    const norm = normalizeDataset(ds);
    const payload = {
      total_failed_coins: norm.entries.length,
      total_peak_market_cap_usd: Number(sumPeak(norm.entries).toFixed(2)),
      entries: norm.entries.map((e) => ({
        id: e.id,
        symbol: e.symbol,
        name: e.name,
        peak_market_cap_usd: Number(toNum(e.peak_market_cap_usd).toFixed(2)),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = CFG.EXPORT_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function scan(root, state) {
    if (inflight) return;
    inflight = true;
    scanStopRequested = false;

    try {
      setText(root, "[data-deado-status]", "loading coins list");

      const { coins } = await fetchCoinsList();
      if (!coins.length) throw new Error("coins list empty");

      const ds = loadDataset();
      const progress = loadProgress();

      const seen = new Set((ds.entries || []).map((e) => String(e.id || "")));
      let idx = Math.max(0, progress.idx || 0);
      let scanned = Math.max(0, progress.scanned || 0);

      setText(root, "[data-deado-status]", `scanning: ${fmtInt(scanned)} / ${fmtInt(coins.length)}`);

      for (; idx < coins.length; idx++) {
        if (scanStopRequested) break;

        const c = coins[idx];
        const coinId = String(c?.id || "").trim();
        const symbol = String(c?.symbol || "").trim();
        const name = String(c?.name || "").trim();

        scanned++;

        if (!coinId) {
          saveProgress({ idx: idx + 1, scanned, last_id: "" });
          continue;
        }

        if (seen.has(coinId)) {
          saveProgress({ idx: idx + 1, scanned, last_id: coinId });
          if (scanned % 25 === 0) setText(root, "[data-deado-status]", `scanning: ${fmtInt(scanned)} / ${fmtInt(coins.length)}`);
          continue;
        }

        let coinJson = null;
        try {
          coinJson = await withTimeout(fetchCoin(coinId), CFG.TIMEOUT_MS, "coin fetch");
        } catch (e) {
          if (e && e.status === 429) {
            setText(root, "[data-deado-status]", "rate limited (429), sleeping 60s");
            await sleep(CFG.RATE_LIMIT_SLEEP_MS);
            idx--; // retry same coin after sleeping
            continue;
          }
          saveProgress({ idx: idx + 1, scanned, last_id: coinId });
          await sleep(CFG.REQUEST_DELAY_MS);
          continue;
        }

        const peak = estimatePeakMarketCapUSD(coinJson);

        if (peak > 0) {
          const entry = {
            id: coinId,
            symbol,
            name,
            peak_market_cap_usd: Number(peak.toFixed(2)),
          };
          ds.entries = ds.entries || [];
          ds.entries.push(entry);
          seen.add(coinId);

          saveDataset(ds);

          const ds2 = loadDataset(); // re-normalize totals
          state.rows = computeRows(ds2);
          renderSummary(root, ds2, "local");
          renderTable(root, state);
        }

        saveProgress({ idx: idx + 1, scanned, last_id: coinId });

        if (scanned % 25 === 0) {
          setText(root, "[data-deado-status]", `scanning: ${fmtInt(scanned)} / ${fmtInt(coins.length)}`);
        }

        await sleep(CFG.REQUEST_DELAY_MS);
      }

      setText(root, "[data-deado-status]", scanStopRequested ? "stopped" : "done");
    } catch (e) {
      setText(root, "[data-deado-status]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function updateFromLocal(root, state) {
    const ds = loadDataset();
    state.rows = computeRows(ds);
    renderSummary(root, ds, "local");
    renderTable(root, state);
    setText(root, "[data-deado-status]", "ok");
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
      refresh.addEventListener("click", () => updateFromLocal(root, state));
    }

    const { scanBtn, stopBtn, exportBtn } = ensureControls(root);

    if (scanBtn && scanBtn.dataset.zzxBound !== "1") {
      scanBtn.dataset.zzxBound = "1";
      scanBtn.addEventListener("click", () => scan(root, state));
    }

    if (stopBtn && stopBtn.dataset.zzxBound !== "1") {
      stopBtn.dataset.zzxBound = "1";
      stopBtn.addEventListener("click", () => { scanStopRequested = true; });
    }

    if (exportBtn && exportBtn.dataset.zzxBound !== "1") {
      exportBtn.dataset.zzxBound = "1";
      exportBtn.addEventListener("click", () => {
        const ds = loadDataset();
        exportDataset(ds);
        setText(root, "[data-deado-status]", "exported (downloaded)");
      });
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

    updateFromLocal(root, state);
    root.__zzxDeadoTimer = setInterval(() => updateFromLocal(root, state), CFG.REFRESH_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
