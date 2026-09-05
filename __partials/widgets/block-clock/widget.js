// __partials/widgets/block-clock/widget.js
// Single controller for the Block Clock widget.
// No local submodules are required.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "block-clock";

  const CONFIG = Object.freeze({
    POLL_MS: 15_000,
    CLOCK_MS: 250,
    REQUEST_TIMEOUT_MS: 10_000,
    REQUEST_RETRIES: 1,
    RETRY_DELAY_MS: 400,
    TARGET_SEC: 600,
    DEFAULT_MEMPOOL_BASE: "https://mempool.space/api"
  });

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function text(root, selector, value) {
    const el = q(root, selector);
    if (el) el.textContent = value == null ? "—" : String(value);
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/g, "");
  }

  function configuredBases(core) {
    return unique([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      CONFIG.DEFAULT_MEMPOOL_BASE
    ].map(normalizeBase));
  }

  function pad2(value) {
    return String(Math.trunc(Math.abs(value))).padStart(2, "0");
  }

  function pad3(value) {
    return String(Math.trunc(Math.abs(value))).padStart(3, "0");
  }

  function durationClock(milliseconds) {
    const raw = finite(milliseconds);
    if (!Number.isFinite(raw)) return "—";

    const sign = raw < 0 ? "−" : "";
    const ms = Math.abs(Math.trunc(raw));
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1_000);
    const millis = ms % 1_000;

    return `${sign}${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
  }

  function durationShort(seconds) {
    const raw = finite(seconds);
    if (!Number.isFinite(raw)) return "—";

    const sign = raw < 0 ? "−" : "";
    const total = Math.abs(Math.round(raw));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours) return `${sign}${hours}h ${minutes}m ${secs}s`;
    return `${sign}${minutes}m ${secs}s`;
  }

  function percentage(value) {
    const number = finite(value);
    if (!Number.isFinite(number)) return "—";
    const sign = number > 0 ? "+" : "";
    return `${sign}${number.toFixed(1)}%`;
  }

  function localTime(epochSeconds) {
    const seconds = finite(epochSeconds);
    if (!Number.isFinite(seconds)) return "—";

    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return "—";

    try {
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (_) {
      return date.toString();
    }
  }

  function utcTime(epochSeconds) {
    const seconds = finite(epochSeconds);
    if (!Number.isFinite(seconds)) return "—";

    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
  }

  function compactHash(hash) {
    const value = String(hash || "").trim();
    if (!value) return "—";
    return value.length > 22
      ? `${value.slice(0, 10)}…${value.slice(-10)}`
      : value;
  }

  function freshness(timestampMs) {
    const ts = finite(timestampMs);
    if (!Number.isFinite(ts)) return "never updated";

    const age = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (age < 2) return "updated now";
    if (age < 60) return `updated ${age}s ago`;
    return `updated ${Math.floor(age / 60)}m ago`;
  }

  function status(root, label, state) {
    const el = q(root, "[data-bc-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  function setTone(root, selector, tone) {
    const el = q(root, selector);
    if (!el) return;
    if (tone) el.setAttribute("data-tone", tone);
    else el.removeAttribute("data-tone");
  }

  function sleep(ms) {
    return new Promise(resolve => W.setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options) {
    const opts = Object.assign({}, options || {});
    const timeoutMs = finite(opts.timeoutMs) || CONFIG.REQUEST_TIMEOUT_MS;
    const retries = Math.max(0, Math.trunc(finite(opts.retries) || 0));
    delete opts.timeoutMs;
    delete opts.retries;

    if (W.ZZXAPI && typeof W.ZZXAPI.fetchRaw === "function") {
      return await W.ZZXAPI.fetchRaw(url, Object.assign({}, opts, {
        cacheBust: false,
        timeoutMs,
        retries,
        retryDelayMs: CONFIG.RETRY_DELAY_MS,
        cache: "no-store",
        credentials: "omit"
      }));
    }

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = typeof AbortController === "function"
        ? new AbortController()
        : null;

      const timer = controller
        ? W.setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await fetch(url, Object.assign({
          cache: "no-store",
          credentials: "omit"
        }, opts, controller ? { signal: controller.signal } : {}));

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} for ${url}`);
          error.status = response.status;
          throw error;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await sleep(CONFIG.RETRY_DELAY_MS);
      } finally {
        if (timer) W.clearTimeout(timer);
      }
    }

    throw lastError || new Error(`request failed: ${url}`);
  }

  async function getText(url) {
    const response = await fetchWithTimeout(url, {
      timeoutMs: CONFIG.REQUEST_TIMEOUT_MS,
      retries: CONFIG.REQUEST_RETRIES
    });
    return (await response.text()).trim();
  }

  async function getJSON(url) {
    const response = await fetchWithTimeout(url, {
      timeoutMs: CONFIG.REQUEST_TIMEOUT_MS,
      retries: CONFIG.REQUEST_RETRIES
    });
    return await response.json();
  }

  async function getFromBases(bases, pathname, parser) {
    let lastError = null;

    for (const base of bases) {
      const requestURL = `${base}${pathname}`;

      try {
        const value = await parser(requestURL);
        return { value, base };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`all providers failed for ${pathname}`);
  }

  async function fetchTipSnapshot(core) {
    const bases = configuredBases(core);

    const heightResult = await getFromBases(
      bases,
      "/blocks/tip/height",
      getText
    );

    const chosenBase = heightResult.base;
    const height = Math.trunc(finite(heightResult.value));

    if (!Number.isFinite(height)) {
      throw new Error("invalid tip height");
    }

    const hash = await getText(`${chosenBase}/blocks/tip/hash`);

    if (!hash) {
      throw new Error("invalid tip hash");
    }

    async function blockByHash(blockHash) {
      const block = await getJSON(
        `${chosenBase}/block/${encodeURIComponent(blockHash)}`
      );

      const timestamp = Math.trunc(finite(block?.timestamp));
      const previous = String(block?.previousblockhash || "").trim();

      if (!Number.isFinite(timestamp)) {
        throw new Error(`missing block timestamp: ${blockHash}`);
      }

      return {
        timestamp,
        previous
      };
    }

    const tip = await blockByHash(hash);

    if (!tip.previous) {
      throw new Error("missing previous block hash");
    }

    const previous = await blockByHash(tip.previous);

    if (!previous.previous) {
      throw new Error("missing second previous block hash");
    }

    const previousPrevious = await blockByHash(previous.previous);

    return {
      height,
      hash,
      tipTs: tip.timestamp,
      prevTs: previous.timestamp,
      prevPrevTs: previousPrevious.timestamp,
      provider: chosenBase,
      fetchedAt: Date.now()
    };
  }

  function renderStatic(root, state) {
    const snapshot = state.snapshot;

    if (!snapshot) return;

    const lastInterval = snapshot.tipTs - snapshot.prevTs;
    const priorInterval = snapshot.prevTs - snapshot.prevPrevTs;

    const deltaPct =
      Number.isFinite(lastInterval) &&
      Number.isFinite(priorInterval) &&
      priorInterval !== 0
        ? ((lastInterval - priorInterval) / Math.abs(priorInterval)) * 100
        : NaN;

    const vsTargetPct =
      Number.isFinite(lastInterval)
        ? ((lastInterval - CONFIG.TARGET_SEC) / CONFIG.TARGET_SEC) * 100
        : NaN;

    text(root, "[data-bc-height]", snapshot.height.toLocaleString());
    text(root, "[data-bc-last-interval]", durationShort(lastInterval));
    text(root, "[data-bc-prior-interval]", durationShort(priorInterval));
    text(root, "[data-bc-delta]", percentage(deltaPct));
    text(root, "[data-bc-vs-target]", percentage(vsTargetPct));

    if (deltaPct > 0.05) setTone(root, "[data-bc-delta]", "warning");
    else if (deltaPct < -0.05) setTone(root, "[data-bc-delta]", "positive");
    else setTone(root, "[data-bc-delta]", null);

    if (vsTargetPct > 0.05) setTone(root, "[data-bc-vs-target]", "warning");
    else if (vsTargetPct < -0.05) setTone(root, "[data-bc-vs-target]", "positive");
    else setTone(root, "[data-bc-vs-target]", null);

    text(root, "[data-bc-prev-local]", localTime(snapshot.prevTs));
    text(root, "[data-bc-tip-local]", localTime(snapshot.tipTs));
    text(
      root,
      "[data-bc-utc-range]",
      `${utcTime(snapshot.prevTs)} → ${utcTime(snapshot.tipTs)}`
    );
    text(root, "[data-bc-next-target]", localTime(snapshot.tipTs + CONFIG.TARGET_SEC));

    const hashEl = q(root, "[data-bc-hash]");
    if (hashEl) {
      hashEl.textContent = compactHash(snapshot.hash);
      hashEl.title = snapshot.hash;
    }

    text(
      root,
      "[data-bc-source]",
      snapshot.provider.replace(/^https?:\/\//i, "")
    );

    status(root, "live", "ok");
  }

  function renderClock(root, state) {
    const snapshot = state.snapshot;

    if (!snapshot) {
      text(root, "[data-bc-age]", "—");
      text(root, "[data-bc-target-label]", "—");
      text(root, "[data-bc-freshness]", "never updated");
      return;
    }

    const ageMs = Date.now() - snapshot.tipTs * 1000;
    const ageSec = ageMs / 1000;

    text(root, "[data-bc-age]", durationClock(ageMs));
    text(root, "[data-bc-freshness]", freshness(snapshot.fetchedAt));

    const ageEl = q(root, "[data-bc-age]");
    const progress = q(root, "[data-bc-progress]");
    const bar = q(root, "[data-bc-progress-bar]");

    let stateName = "normal";

    if (ageSec < 0) stateName = "future";
    else if (ageSec > CONFIG.TARGET_SEC) stateName = "over";

    if (ageEl) ageEl.setAttribute("data-age-state", stateName);
    if (progress) progress.setAttribute("data-state", stateName);

    const bounded = Math.min(CONFIG.TARGET_SEC, Math.max(0, ageSec));
    const percentageComplete = (bounded / CONFIG.TARGET_SEC) * 100;

    if (bar) {
      bar.style.width = `${percentageComplete.toFixed(2)}%`;
    }

    if (progress) {
      progress.setAttribute(
        "aria-valuenow",
        String(Math.round(Math.max(0, ageSec)))
      );
    }

    if (ageSec < 0) {
      text(root, "[data-bc-target-label]", "tip timestamp is ahead of local clock");
    } else if (ageSec <= CONFIG.TARGET_SEC) {
      text(
        root,
        "[data-bc-target-label]",
        `${durationShort(CONFIG.TARGET_SEC - ageSec)} remaining to nominal target`
      );
    } else {
      text(
        root,
        "[data-bc-target-label]",
        `${durationShort(ageSec - CONFIG.TARGET_SEC)} beyond nominal target`
      );
    }
  }

  async function refresh(root, state, core) {
    if (!root || !root.isConnected) return false;

    if (state.inflight) {
      state.refreshQueued = true;
      return false;
    }

    state.inflight = true;
    state.refreshQueued = false;
    status(root, "refreshing", "warn");

    const refreshButton = q(root, "[data-bc-refresh]");
    if (refreshButton) refreshButton.disabled = true;

    try {
      const next = await fetchTipSnapshot(core);

      if (
        !state.snapshot ||
        state.snapshot.hash !== next.hash ||
        state.snapshot.height !== next.height
      ) {
        state.snapshot = next;
        renderStatic(root, state);
      } else {
        state.snapshot.fetchedAt = next.fetchedAt;
        state.snapshot.provider = next.provider;
      }

      renderClock(root, state);
      status(root, "live", "ok");
      return true;

    } catch (error) {
      console.warn("[block-clock] refresh failed", error);

      status(
        root,
        state.snapshot ? "stale" : "offline",
        state.snapshot ? "warn" : "error"
      );

      if (!state.snapshot) {
        text(root, "[data-bc-source]", "mempool unavailable");
      }

      return false;

    } finally {
      state.inflight = false;
      if (refreshButton) refreshButton.disabled = false;

      if (state.refreshQueued && root.isConnected) {
        state.refreshQueued = false;
        W.setTimeout(() => refresh(root, state, core), 0);
      }
    }
  }

  function clearTimers(state) {
    if (!state) return;

    if (state.pollTimer) {
      W.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }

    if (state.clockTimer) {
      W.clearTimeout(state.clockTimer);
      state.clockTimer = null;
    }
  }

  function startLoops(root, state, core) {
    clearTimers(state);

    const generation = ++state.generation;

    async function pollLoop() {
      if (
        generation !== state.generation ||
        !root.isConnected
      ) {
        return;
      }

      await refresh(root, state, core);

      if (
        generation === state.generation &&
        root.isConnected
      ) {
        state.pollTimer = W.setTimeout(
          pollLoop,
          CONFIG.POLL_MS
        );
      }
    }

    function clockLoop() {
      if (
        generation !== state.generation ||
        !root.isConnected
      ) {
        return;
      }

      renderClock(root, state);

      state.clockTimer = W.setTimeout(
        clockLoop,
        CONFIG.CLOCK_MS
      );
    }

    pollLoop();
    clockLoop();
  }

  function wire(root, state, core) {
    const button = q(root, "[data-bc-refresh]");

    if (
      button &&
      button.dataset.zzxBound !== "1"
    ) {
      button.dataset.zzxBound = "1";

      button.addEventListener("click", () => {
        refresh(root, state, core);
      });
    }
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxBlockClockState) {
      clearTimers(root.__zzxBlockClockState);
    }

    const state = {
      snapshot: null,
      inflight: false,
      refreshQueued: false,
      pollTimer: null,
      clockTimer: null,
      generation: 0
    };

    root.__zzxBlockClockState = state;

    wire(root, state, core);
    startLoops(root, state, core);
  }

  if (
    W.ZZXAPI &&
    typeof W.ZZXAPI.register === "function"
  ) {
    W.ZZXAPI.register(ID, boot);

  } else if (
    W.ZZXWidgetsCore &&
    typeof W.ZZXWidgetsCore.onMount === "function"
  ) {
    W.ZZXWidgetsCore.onMount(ID, boot);

  } else if (
    W.ZZXWidgets &&
    typeof W.ZZXWidgets.register === "function"
  ) {
    W.ZZXWidgets.register(ID, boot);
  }

})();
