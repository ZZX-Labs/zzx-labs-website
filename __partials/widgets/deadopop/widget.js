// __partials/widgets/deadopop/widget.js
// Read-only DeadOPop widget backed by:
//   /bitcoin/bpi/api/deadopop.json
//
// DeadOPop is an archival index of failed/dead/bankrupt/scam/collapsed
// cryptoassets and their estimated destroyed/lost value. It is NOT the
// active non-Bitcoin crypto market.

(function () {
  "use strict";

  const W = window;
  const ID = "deadopop";

  const CFG = {
    PAGE_SIZE: 5,
    REFRESH_MS: 10 * 60_000,
    TIMEOUT_MS: 20_000,
    CACHE_KEY: "zzx:deadopop:deadcoins:v2",
  };

  function q(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  function setText(root, sel, value) {
    const el = q(root, sel);
    if (el) el.textContent = String(value ?? "—");
  }

  function toFiniteNumber(value, fallback = NaN) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtUSD0(value) {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return "—";

    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }

  function fmtInt(value) {
    const n = toFiniteNumber(value);
    if (!Number.isFinite(n)) return "—";
    return Math.trunc(n).toLocaleString();
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
    return [...new Set([
      new URL(
        "bitcoin/bpi/api/deadopop.json",
        projectRootURL()
      ).toString(),

      new URL(
        "api/deadopop.json",
        document.baseURI
      ).toString(),
    ])];
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeDeadCoin(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const id = String(item.id || "").trim();
    const symbol = String(item.symbol || "").trim();
    const name = String(item.name || "").trim();
    const status = String(item.status || "").trim();
    const failureDate = String(item.failure_date || "").trim();
    const loss = toFiniteNumber(
      item.estimated_value_lost_usd
    );
    const peak = toFiniteNumber(
      item.peak_market_cap_usd,
      NaN
    );

    if (!id || !Number.isFinite(loss) || loss <= 0) {
      return null;
    }

    return {
      rank: Math.trunc(
        toFiniteNumber(item.rank, 0)
      ),
      id,
      symbol,
      name,
      status,
      failure_date: failureDate,
      estimated_value_lost_usd: loss,
      peak_market_cap_usd: peak,
    };
  }

  function normalizeDataset(data) {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new Error(
        "DeadOPop API root must be an object"
      );
    }

    if (
      data.source !==
      "zzx_deadcoins_archival_registry"
    ) {
      throw new Error(
        "refusing legacy/non-archival DeadOPop source"
      );
    }

    if (data.bitcoin_excluded !== true) {
      throw new Error(
        "DeadOPop did not explicitly exclude Bitcoin"
      );
    }

    if (data.available === false) {
      if (
        data.status !== "registry_unavailable"
      ) {
        throw new Error(
          "invalid DeadOPop unavailable marker"
        );
      }

      return {
        available: false,
        status: "registry_unavailable",
        registry_reason: String(
          data.registry_reason || "unknown"
        ),
        updated_at: String(
          data.updated_at || ""
        ),
        total_dead_coins: 0,
        combined_estimated_value_lost_usd: null,
        combined_peak_market_cap_usd: null,
        top_dead_coins: [],
      };
    }

    const count = toFiniteNumber(
      data.total_dead_coins
    );
    const lost = toFiniteNumber(
      data.combined_estimated_value_lost_usd
    );
    const peak = toFiniteNumber(
      data.combined_peak_market_cap_usd,
      0
    );

    if (!Number.isFinite(count) || count < 1) {
      throw new Error(
        "invalid dead coin count"
      );
    }

    if (!Number.isFinite(lost) || lost <= 0) {
      throw new Error(
        "invalid combined lost value"
      );
    }

    if (!Number.isFinite(peak) || peak < 0) {
      throw new Error(
        "invalid combined peak market cap"
      );
    }

    const rows = (
      Array.isArray(data.top_dead_coins)
        ? data.top_dead_coins
        : []
    )
      .map(normalizeDeadCoin)
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.estimated_value_lost_usd -
          a.estimated_value_lost_usd
      );

    if (!rows.length) {
      throw new Error(
        "DeadOPop contains no dead-coin rows"
      );
    }

    return {
      available: true,
      updated_at: String(
        data.updated_at || ""
      ),
      total_dead_coins: Math.trunc(count),
      combined_estimated_value_lost_usd: lost,
      combined_peak_market_cap_usd: peak,
      top_dead_coins: rows,
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
      const raw = localStorage.getItem(
        CFG.CACHE_KEY
      );

      if (!raw) return null;

      const data = JSON.parse(raw);

      if (
        data &&
        typeof data === "object" &&
        "available" in data
      ) {
        return data;
      }

      return null;
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
          `${url}: ${String(
            error?.message || error
          )}`
        );
      }
    }

    throw new Error(errors.join(" | "));
  }

  function renderTable(root, state) {
    const body = q(
      root,
      "[data-deado-body]"
    );

    if (!body) return;

    const rows = state.rows || [];
    const totalPages = Math.max(
      1,
      Math.ceil(
        rows.length / CFG.PAGE_SIZE
      )
    );

    state.page = Math.min(
      Math.max(1, state.page || 1),
      totalPages
    );

    const start =
      (state.page - 1) *
      CFG.PAGE_SIZE;

    const slice = rows.slice(
      start,
      start + CFG.PAGE_SIZE
    );

    body.replaceChildren();

    slice.forEach((item, index) => {
      const rank =
        item.rank > 0
          ? item.rank
          : start + index + 1;

      const label =
        item.name || item.id || "Unknown";

      const symbol = item.symbol
        ? ` (${item.symbol.toUpperCase()})`
        : "";

      const failure = item.status
        ? item.status.replaceAll("_", " ")
        : "dead";

      const row =
        document.createElement("div");

      row.className = "zzx-deado-row";
      row.setAttribute("role", "row");

      row.innerHTML =
        `<div class="zzx-deado-cell" role="cell">${escapeHTML(rank)}</div>` +
        `<div class="zzx-deado-cell" role="cell" title="${escapeHTML(label + symbol)}">` +
        `${escapeHTML(label)}${escapeHTML(symbol)}</div>` +
        `<div class="zzx-deado-cell" role="cell" title="${escapeHTML(item.failure_date)}">` +
        `${escapeHTML(failure)}</div>` +
        `<div class="zzx-deado-cell zzx-deado-num" role="cell">` +
        `${escapeHTML(fmtUSD0(item.estimated_value_lost_usd))}</div>`;

      body.appendChild(row);
    });

    setText(
      root,
      "[data-deado-page]",
      `Page ${state.page} / ${totalPages}`
    );

    const prev = q(
      root,
      "[data-deado-prev]"
    );

    const next = q(
      root,
      "[data-deado-next]"
    );

    if (prev) {
      prev.disabled =
        state.page <= 1 ||
        rows.length === 0;
    }

    if (next) {
      next.disabled =
        state.page >= totalPages ||
        rows.length === 0;
    }
  }

  function renderUnavailable(
    root,
    state,
    dataset,
    sourceLabel
  ) {
    state.rows = [];
    state.page = 1;

    setText(
      root,
      "[data-deado-headline]",
      "Deadopop unavailable"
    );

    setText(
      root,
      "[data-deado-sub]",
      "archival dead-coin registry not populated"
    );

    setText(
      root,
      "[data-deado-count]",
      "0"
    );

    setText(
      root,
      "[data-deado-lost]",
      "—"
    );

    setText(
      root,
      "[data-deado-peak]",
      "—"
    );

    // Compatibility with the immediately previous HTML variant.
    setText(
      root,
      "[data-deado-total]",
      "—"
    );

    setText(
      root,
      "[data-deado-volume]",
      "—"
    );

    setText(
      root,
      "[data-deado-status]",
      `${sourceLabel || "API"} • registry ${dataset.registry_reason || "unavailable"} • updated ${fmtTime(dataset.updated_at)}`
    );

    renderTable(root, state);
  }

  function renderAvailable(
    root,
    state,
    dataset,
    sourceLabel
  ) {
    state.rows =
      dataset.top_dead_coins || [];

    state.page = 1;

    setText(
      root,
      "[data-deado-headline]",
      `dead capital lost: ${fmtUSD0(
        dataset.combined_estimated_value_lost_usd
      )}`
    );

    setText(
      root,
      "[data-deado-sub]",
      `${fmtInt(
        dataset.total_dead_coins
      )} failed / dead / scam coins`
    );

    setText(
      root,
      "[data-deado-count]",
      fmtInt(
        dataset.total_dead_coins
      )
    );

    setText(
      root,
      "[data-deado-lost]",
      fmtUSD0(
        dataset.combined_estimated_value_lost_usd
      )
    );

    setText(
      root,
      "[data-deado-peak]",
      fmtUSD0(
        dataset.combined_peak_market_cap_usd
      )
    );

    // Compatibility with the immediately previous HTML variant.
    setText(
      root,
      "[data-deado-total]",
      fmtUSD0(
        dataset.combined_peak_market_cap_usd
      )
    );

    setText(
      root,
      "[data-deado-volume]",
      fmtUSD0(
        dataset.combined_estimated_value_lost_usd
      )
    );

    setText(
      root,
      "[data-deado-status]",
      `${sourceLabel || "API"} • updated ${fmtTime(
        dataset.updated_at
      )}`
    );

    renderTable(root, state);
  }

  function applyDataset(
    root,
    state,
    dataset,
    sourceLabel
  ) {
    state.dataset = dataset;

    if (dataset.available === false) {
      renderUnavailable(
        root,
        state,
        dataset,
        sourceLabel
      );
      return;
    }

    renderAvailable(
      root,
      state,
      dataset,
      sourceLabel
    );
  }

  async function refresh(root, state) {
    if (state.inflight) return;
    state.inflight = true;

    const refreshButton = q(
      root,
      "[data-deado-refresh]"
    );

    if (refreshButton) {
      refreshButton.disabled = true;
    }

    setText(
      root,
      "[data-deado-status]",
      "refreshing…"
    );

    try {
      const result =
        await loadRemote();

      saveCache(
        result.dataset
      );

      applyDataset(
        root,
        state,
        result.dataset,
        "live"
      );
    } catch (error) {
      const cached =
        loadCache();

      if (cached) {
        applyDataset(
          root,
          state,
          cached,
          "cached"
        );

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
          "no valid archival dataset"
        );

        setText(
          root,
          "[data-deado-status]",
          `error: ${String(
            error?.message || error
          )}`
        );
      }
    } finally {
      state.inflight = false;

      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  }

  function wire(root, state) {
    const prev = q(
      root,
      "[data-deado-prev]"
    );

    const next = q(
      root,
      "[data-deado-next]"
    );

    const refreshButton = q(
      root,
      "[data-deado-refresh]"
    );

    if (
      prev &&
      prev.dataset.zzxBound !== "1"
    ) {
      prev.dataset.zzxBound = "1";

      prev.addEventListener(
        "click",
        () => {
          state.page =
            Math.max(
              1,
              (state.page || 1) - 1
            );

          renderTable(
            root,
            state
          );
        }
      );
    }

    if (
      next &&
      next.dataset.zzxBound !== "1"
    ) {
      next.dataset.zzxBound = "1";

      next.addEventListener(
        "click",
        () => {
          state.page += 1;

          renderTable(
            root,
            state
          );
        }
      );
    }

    if (
      refreshButton &&
      refreshButton.dataset.zzxBound !== "1"
    ) {
      refreshButton.dataset.zzxBound = "1";

      refreshButton.addEventListener(
        "click",
        () => refresh(
          root,
          state
        )
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

    wire(
      root,
      state
    );

    if (root.__zzxDeadoTimer) {
      clearInterval(
        root.__zzxDeadoTimer
      );

      root.__zzxDeadoTimer = null;
    }

    const cached =
      loadCache();

    if (cached) {
      applyDataset(
        root,
        state,
        cached,
        "cached"
      );
    }

    refresh(
      root,
      state
    );

    root.__zzxDeadoTimer =
      setInterval(
        () => refresh(
          root,
          state
        ),
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
