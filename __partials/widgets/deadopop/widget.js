// __partials/widgets/deadopop/widget.js
// Read-only Deadopop widget backed by:
//   bitcoin/bpi/api/deadopop.json
//
// The backend workflow owns CoinGecko collection. The browser never crawls
// CoinGecko, never proxies through AllOrigins, and never estimates "dead coin"
// peak market caps locally.

(function () {
  "use strict";

  const W = window;
  const ID = "deadopop";

  const CFG = {
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,
    TIMEOUT_MS: 20_000,
    CACHE_KEY: "zzx:deadopop:api-cache:v2",
  };

  function q(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  function setText(root, sel, text) {
    const el = q(root, sel);
    if (el) el.textContent = String(text ?? "—");
  }

  function toFiniteNumber(value, fallback = NaN) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function fmtUSD0(value) {
    const number = toFiniteNumber(value);
    if (!Number.isFinite(number)) return "—";

    return number.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }

  function fmtInt(value) {
    const number = toFiniteNumber(value);
    if (!Number.isFinite(number)) return "—";
    return Math.trunc(number).toLocaleString();
  }

  function fmtTime(value) {
    const date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "unknown time";

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function projectRootURL() {
    const current = new URL(document.baseURI);

    if (current.hostname.endsWith(".github.io")) {
      const parts = current.pathname.split("/").filter(Boolean);
      if (parts.length) {
        return new URL(`/${parts[0]}/`, current.origin);
      }
    }

    return new URL("/", current.origin);
  }

  function apiCandidates() {
    const candidates = [];

    // First choice when the widget is rendered on /bitcoin/bpi/.
    candidates.push(
      new URL("api/deadopop.json", document.baseURI).toString()
    );

    // Stable site-root choice for widgets mounted elsewhere.
    candidates.push(
      new URL(
        "bitcoin/bpi/api/deadopop.json",
        projectRootURL()
      ).toString()
    );

    return [...new Set(candidates)];
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      CFG.TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
        },
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("invalid JSON");
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeAsset(asset) {
    if (!asset || typeof asset !== "object") return null;

    const id = String(asset.id || "").trim();
    const symbol = String(asset.symbol || "").trim();
    const name = String(asset.name || "").trim();
    const marketCap = toFiniteNumber(asset.market_cap_usd);

    if (!id || !Number.isFinite(marketCap) || marketCap <= 0) {
      return null;
    }

    return {
      rank: toFiniteNumber(asset.rank, 0),
      id,
      symbol,
      name,
      market_cap_usd: marketCap,
      volume_24h_usd: Math.max(
        0,
        toFiniteNumber(asset.volume_24h_usd, 0)
      ),
      price_usd: Math.max(
        0,
        toFiniteNumber(asset.price_usd, 0)
      ),
      price_change_24h_percent:
        toFiniteNumber(asset.price_change_24h_percent, NaN),
    };
  }

  function normalizeDataset(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Deadopop API root must be an object");
    }

    if (data.bitcoin_excluded !== true) {
      throw new Error("Deadopop API did not explicitly exclude Bitcoin");
    }

    const count = toFiniteNumber(
      data.non_bitcoin_assets_count
    );
    const marketCap = toFiniteNumber(
      data.alive_non_bitcoin_market_cap_usd
    );
    const totalMarketCap = toFiniteNumber(
      data.total_non_bitcoin_market_cap_usd
    );
    const volume = toFiniteNumber(
      data.alive_non_bitcoin_volume_24h_usd
    );

    if (!Number.isFinite(count) || count < 1) {
      throw new Error("invalid non-Bitcoin asset count");
    }

    if (!Number.isFinite(marketCap) || marketCap <= 0) {
      throw new Error("invalid non-Bitcoin market cap");
    }

    if (!Number.isFinite(totalMarketCap) || totalMarketCap <= 0) {
      throw new Error("invalid total non-Bitcoin market cap");
    }

    if (!Number.isFinite(volume) || volume < 0) {
      throw new Error("invalid non-Bitcoin 24h volume");
    }

    const rawTop = Array.isArray(data.top_non_bitcoin_assets)
      ? data.top_non_bitcoin_assets
      : [];

    const top = rawTop
      .map(normalizeAsset)
      .filter(Boolean)
      .sort((a, b) => {
        const ar = a.rank > 0 ? a.rank : Number.MAX_SAFE_INTEGER;
        const br = b.rank > 0 ? b.rank : Number.MAX_SAFE_INTEGER;

        if (ar !== br) return ar - br;
        return b.market_cap_usd - a.market_cap_usd;
      });

    if (!top.length) {
      throw new Error("Deadopop API contains no valid top assets");
    }

    return {
      source: String(data.source || "deadopop"),
      scope: String(data.scope || ""),
      updated_at: String(data.updated_at || ""),
      pages_scanned: Math.trunc(
        toFiniteNumber(data.pages_scanned, 0)
      ),
      non_bitcoin_assets_count: Math.trunc(count),
      alive_non_bitcoin_market_cap_usd: marketCap,
      alive_non_bitcoin_volume_24h_usd: volume,
      total_non_bitcoin_market_cap_usd: totalMarketCap,
      bitcoin_excluded: true,
      top_non_bitcoin_assets: top,
    };
  }

  function saveCache(dataset) {
    try {
      localStorage.setItem(
        CFG.CACHE_KEY,
        JSON.stringify(dataset)
      );
    } catch {
      // Cache failure must never break the widget.
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CFG.CACHE_KEY);
      if (!raw) return null;
      return normalizeDataset(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async function loadRemote() {
    const errors = [];

    for (const url of apiCandidates()) {
      try {
        const data = await fetchJSON(url);
        return {
          dataset: normalizeDataset(data),
          url,
        };
      } catch (error) {
        errors.push(
          `${url}: ${String(error?.message || error)}`
        );
      }
    }

    throw new Error(errors.join(" | "));
  }

  function renderTable(root, state) {
    const body = q(root, "[data-deado-body]");
    if (!body) return;

    const rows = state.rows || [];
    const pageSize = CFG.PAGE_SIZE;
    const totalPages = Math.max(
      1,
      Math.ceil(rows.length / pageSize)
    );
    const page = Math.min(
      Math.max(1, state.page || 1),
      totalPages
    );

    state.page = page;
    state.totalPages = totalPages;

    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    body.replaceChildren();

    for (let index = 0; index < slice.length; index++) {
      const asset = slice[index];
      const displayRank =
        asset.rank > 0 ? Math.trunc(asset.rank) : start + index + 1;

      const label = asset.name || asset.id || "Unknown";
      const symbol = asset.symbol
        ? ` (${String(asset.symbol).toUpperCase()})`
        : "";

      const row = document.createElement("div");
      row.className = "zzx-deado-row";
      row.setAttribute("role", "row");

      row.innerHTML =
        `<div class="zzx-deado-cell" role="cell">${escapeHTML(displayRank)}</div>` +
        `<div class="zzx-deado-cell" role="cell" title="${escapeHTML(label + symbol)}">` +
        `${escapeHTML(label)}${escapeHTML(symbol)}</div>` +
        `<div class="zzx-deado-cell zzx-deado-num" role="cell">` +
        `${escapeHTML(fmtUSD0(asset.market_cap_usd))}</div>`;

      body.appendChild(row);
    }

    setText(
      root,
      "[data-deado-page]",
      `Page ${page} / ${totalPages}`
    );

    const prev = q(root, "[data-deado-prev]");
    const next = q(root, "[data-deado-next]");

    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  function renderSummary(root, dataset, sourceLabel) {
    setText(
      root,
      "[data-deado-headline]",
      `non-Bitcoin market cap: ${fmtUSD0(
        dataset.alive_non_bitcoin_market_cap_usd
      )}`
    );

    setText(
      root,
      "[data-deado-sub]",
      `${fmtInt(dataset.non_bitcoin_assets_count)} active assets`
    );

    setText(
      root,
      "[data-deado-count]",
      fmtInt(dataset.non_bitcoin_assets_count)
    );

    setText(
      root,
      "[data-deado-total]",
      fmtUSD0(dataset.total_non_bitcoin_market_cap_usd)
    );

    setText(
      root,
      "[data-deado-volume]",
      fmtUSD0(dataset.alive_non_bitcoin_volume_24h_usd)
    );

    const source = sourceLabel || "API";
    setText(
      root,
      "[data-deado-status]",
      `${source} • updated ${fmtTime(dataset.updated_at)}`
    );
  }

  function applyDataset(root, state, dataset, sourceLabel) {
    state.dataset = dataset;
    state.rows = dataset.top_non_bitcoin_assets || [];
    state.page = 1;

    renderSummary(root, dataset, sourceLabel);
    renderTable(root, state);
  }

  async function refresh(root, state) {
    if (state.inflight) return;
    state.inflight = true;

    const refreshButton = q(root, "[data-deado-refresh]");
    if (refreshButton) refreshButton.disabled = true;

    setText(root, "[data-deado-status]", "refreshing…");

    try {
      const result = await loadRemote();
      saveCache(result.dataset);
      applyDataset(root, state, result.dataset, "live");
    } catch (error) {
      const cached = loadCache();

      if (cached) {
        applyDataset(root, state, cached, "cached");
        setText(
          root,
          "[data-deado-status]",
          `cached • live refresh failed: ${String(
            error?.message || error
          )}`
        );
      } else {
        setText(
          root,
          "[data-deado-headline]",
          "Deadopop unavailable"
        );
        setText(
          root,
          "[data-deado-sub]",
          "no cached dataset"
        );
        setText(
          root,
          "[data-deado-status]",
          `error: ${String(error?.message || error)}`
        );
      }
    } finally {
      state.inflight = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  function wire(root, state) {
    const prev = q(root, "[data-deado-prev]");
    const next = q(root, "[data-deado-next]");
    const refreshButton = q(root, "[data-deado-refresh]");

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
        state.page = Math.min(
          state.totalPages || 1,
          (state.page || 1) + 1
        );
        renderTable(root, state);
      });
    }

    if (
      refreshButton &&
      refreshButton.dataset.zzxBound !== "1"
    ) {
      refreshButton.dataset.zzxBound = "1";
      refreshButton.addEventListener(
        "click",
        () => refresh(root, state)
      );
    }
  }

  function boot(root) {
    if (!root) return;

    const state = (
      root.__zzxDeadoState =
        root.__zzxDeadoState || {
          rows: [],
          page: 1,
          totalPages: 1,
          dataset: null,
          inflight: false,
        }
    );

    wire(root, state);

    if (root.__zzxDeadoTimer) {
      clearInterval(root.__zzxDeadoTimer);
      root.__zzxDeadoTimer = null;
    }

    const cached = loadCache();
    if (cached) {
      applyDataset(root, state, cached, "cached");
    }

    refresh(root, state);

    root.__zzxDeadoTimer = setInterval(
      () => refresh(root, state),
      CFG.REFRESH_MS
    );
  }

  if (
    W.ZZXWidgetsCore &&
    typeof W.ZZXWidgetsCore.onMount === "function"
  ) {
    W.ZZXWidgetsCore.onMount(
      ID,
      (root) => boot(root)
    );
  } else if (
    W.ZZXWidgets &&
    typeof W.ZZXWidgets.register === "function"
  ) {
    W.ZZXWidgets.register(
      ID,
      function (root) {
        boot(root);
      }
    );
  }
})();
