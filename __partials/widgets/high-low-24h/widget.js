// __partials/widgets/high-low-24h/widget.js
// Primary controller for the 24h High / Low widget.
// Loads local js/sources.js and js/chart.js.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "high-low-24h";

  const CONFIG = Object.freeze({
    STORE_KEY: "zzx.widget.high-low-24h.exchange",
    REFRESH_MS: 30_000,
    REQUEST_TIMEOUT_MS: 10_000,
    REQUEST_RETRIES: 1,
    RETRY_DELAY_MS: 450
  });

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatUSD(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    try {
      return n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch (_) {
      return "$" + n.toFixed(2);
    }
  }

  function signedPercent(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return sign + Math.abs(n).toFixed(2) + "%";
  }

  function safeGet(key) {
    try {
      return W.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      W.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function widgetBase(core) {
    if (core?.widgetBase) {
      return String(core.widgetBase(ID)).replace(/\/+$/g, "");
    }

    return "/__partials/widgets/high-low-24h";
  }

  function assetURL(core, relativePath) {
    const path =
      `${widgetBase(core)}/${String(relativePath).replace(/^\/+/g, "")}`;

    if (core?.url) return core.url(path);
    if (W.ZZXAPI?.url) return W.ZZXAPI.url(path);
    return path;
  }

  function scriptKey(value) {
    return String(value).replace(/[^a-z0-9_-]/gi, "_");
  }

  async function loadScriptOnce(core, relativePath) {
    const src = assetURL(core, relativePath);
    const key = scriptKey(`${ID}:${relativePath}`);

    if (core?.ensureScriptOnce) {
      return await core.ensureScriptOnce(key, src);
    }

    let existing =
      D.querySelector(`script[data-highlow24-module="${key}"]`);

    if (existing?.dataset.loaded === "1") return true;

    if (existing?.dataset.failed === "1") {
      existing.remove();
      existing = null;
    }

    if (existing) {
      return await new Promise(resolve => {
        existing.addEventListener(
          "load",
          () => resolve(true),
          { once: true }
        );

        existing.addEventListener(
          "error",
          () => resolve(false),
          { once: true }
        );
      });
    }

    return await new Promise(resolve => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute("data-highlow24-module", key);

      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve(true);
      }, { once: true });

      script.addEventListener("error", () => {
        script.dataset.failed = "1";
        resolve(false);
      }, { once: true });

      (D.head || D.documentElement).appendChild(script);
    });
  }

  async function ensureModules(core) {
    if (!W.ZZXHighLow24Sources?.list) {
      const ok =
        await loadScriptOnce(
          core,
          "js/sources.js"
        );

      if (
        !ok ||
        !W.ZZXHighLow24Sources?.list
      ) {
        throw new Error(
          "sources module unavailable"
        );
      }
    }

    if (!W.ZZXHighLow24Chart?.draw) {
      const ok =
        await loadScriptOnce(
          core,
          "js/chart.js"
        );

      if (
        !ok ||
        !W.ZZXHighLow24Chart?.draw
      ) {
        throw new Error(
          "chart module unavailable"
        );
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => {
      W.setTimeout(resolve, ms);
    });
  }

  async function fetchJSON(url) {
    if (W.ZZXAPI?.fetchRaw) {
      const response =
        await W.ZZXAPI.fetchRaw(url, {
          cacheBust: false,
          cache: "no-store",
          credentials: "omit",
          timeoutMs: CONFIG.REQUEST_TIMEOUT_MS,
          retries: CONFIG.REQUEST_RETRIES,
          retryDelayMs: CONFIG.RETRY_DELAY_MS
        });

      return await response.json();
    }

    let lastError = null;

    for (
      let attempt = 0;
      attempt <= CONFIG.REQUEST_RETRIES;
      attempt++
    ) {
      const controller =
        typeof AbortController === "function"
          ? new AbortController()
          : null;

      const timer =
        controller
          ? W.setTimeout(
              () => controller.abort(),
              CONFIG.REQUEST_TIMEOUT_MS
            )
          : null;

      try {
        const response =
          await fetch(url, {
            cache: "no-store",
            credentials: "omit",
            signal: controller?.signal
          });

        if (!response.ok) {
          const error =
            new Error(
              `HTTP ${response.status} for ${url}`
            );

          error.status = response.status;
          throw error;
        }

        return await response.json();

      } catch (error) {
        lastError = error;

        if (
          attempt <
          CONFIG.REQUEST_RETRIES
        ) {
          await sleep(
            CONFIG.RETRY_DELAY_MS
          );
        }

      } finally {
        if (timer) {
          W.clearTimeout(timer);
        }
      }
    }

    throw (
      lastError ||
      new Error(
        `request failed: ${url}`
      )
    );
  }

  function calculate(candles) {
    if (
      !Array.isArray(candles) ||
      candles.length < 2
    ) {
      throw new Error(
        "insufficient completed hourly candles"
      );
    }

    let high = -Infinity;
    let low = Infinity;
    let highIndex = -1;
    let lowIndex = -1;

    candles.forEach(
      (candle, index) => {
        const candleHigh =
          finite(candle?.h);

        const candleLow =
          finite(candle?.l);

        if (
          Number.isFinite(candleHigh) &&
          candleHigh > high
        ) {
          high = candleHigh;
          highIndex = index;
        }

        if (
          Number.isFinite(candleLow) &&
          candleLow < low
        ) {
          low = candleLow;
          lowIndex = index;
        }
      }
    );

    const open =
      finite(candles[0]?.o);

    const close =
      finite(
        candles[
          candles.length - 1
        ]?.c
      );

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(open) ||
      !Number.isFinite(close) ||
      high < low
    ) {
      throw new Error(
        "invalid high low candle data"
      );
    }

    const rangeAbs =
      high - low;

    const rangePct =
      low > 0
        ? (rangeAbs / low) * 100
        : NaN;

    const positionPct =
      rangeAbs > 0
        ? ((close - low) / rangeAbs) * 100
        : 50;

    const changePct =
      open > 0
        ? ((close - open) / open) * 100
        : NaN;

    return {
      high,
      low,
      highIndex,
      lowIndex,
      highCandle:
        candles[highIndex] || null,
      lowCandle:
        candles[lowIndex] || null,
      open,
      close,
      rangeAbs,
      rangePct,
      positionPct:
        Math.min(
          100,
          Math.max(
            0,
            positionPct
          )
        ),
      changePct
    };
  }

  function toneFor(value) {
    const n = finite(value);

    if (
      !Number.isFinite(n) ||
      Math.abs(n) < 0.000001
    ) {
      return "flat";
    }

    return n > 0 ? "up" : "down";
  }

  function timeLabel(timestampMs) {
    const ts =
      finite(timestampMs);

    if (!Number.isFinite(ts)) {
      return "—";
    }

    const date =
      new Date(ts);

    try {
      return date.toLocaleString(
        undefined,
        {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      );
    } catch (_) {
      return date.toString();
    }
  }

  function candleFreshness(candle) {
    const ts =
      finite(candle?.t);

    if (!Number.isFinite(ts)) {
      return "timestamp unavailable";
    }

    const completedAt =
      ts +
      (
        W.ZZXHighLow24Sources?.HOUR_MS ||
        3_600_000
      );

    const ageSec =
      Math.max(
        0,
        Math.round(
          (
            Date.now() -
            completedAt
          ) /
          1000
        )
      );

    if (ageSec < 60) {
      return `${ageSec}s since last completed hour`;
    }

    if (ageSec < 3600) {
      return `${Math.floor(ageSec / 60)}m since last completed hour`;
    }

    return `${Math.floor(ageSec / 3600)}h since last completed hour`;
  }

  function populateSources(
    root,
    sources,
    selected
  ) {
    const select =
      q(
        root,
        "[data-highlow24-source]"
      );

    if (!select) return;

    select.replaceChildren();

    for (const source of sources) {
      const option =
        D.createElement("option");

      option.value =
        source.id;

      option.textContent =
        source.label;

      select.appendChild(
        option
      );
    }

    if (
      sources.some(
        source =>
          source.id === selected
      )
    ) {
      select.value = selected;
    }
  }

  function status(
    root,
    label,
    state
  ) {
    const el =
      q(
        root,
        "[data-highlow24-status]"
      );

    if (!el) return;

    el.textContent =
      label;

    el.setAttribute(
      "data-status",
      state || "offline"
    );
  }

  function render(root, state) {
    const metrics =
      state.metrics;

    const candles =
      state.candles;

    if (
      !metrics ||
      !candles?.length
    ) {
      return;
    }

    const high =
      q(
        root,
        "[data-highlow24-high]"
      );

    if (high) {
      high.textContent =
        formatUSD(metrics.high);
    }

    const low =
      q(
        root,
        "[data-highlow24-low]"
      );

    if (low) {
      low.textContent =
        formatUSD(metrics.low);
    }

    const highTime =
      q(
        root,
        "[data-highlow24-high-time]"
      );

    if (highTime) {
      highTime.textContent =
        timeLabel(
          metrics.highCandle?.t
        );
    }

    const lowTime =
      q(
        root,
        "[data-highlow24-low-time]"
      );

    if (lowTime) {
      lowTime.textContent =
        timeLabel(
          metrics.lowCandle?.t
        );
    }

    const range =
      q(
        root,
        "[data-highlow24-range]"
      );

    if (range) {
      range.textContent =
        `${formatUSD(metrics.rangeAbs)} · ${metrics.rangePct.toFixed(2)}%`;
    }

    const close =
      q(
        root,
        "[data-highlow24-close]"
      );

    if (close) {
      close.textContent =
        formatUSD(metrics.close);
    }

    const position =
      q(
        root,
        "[data-highlow24-position]"
      );

    if (position) {
      position.textContent =
        metrics.positionPct.toFixed(1) +
        "%";
    }

    const positionLabel =
      q(
        root,
        "[data-highlow24-position-label]"
      );

    if (positionLabel) {
      positionLabel.textContent =
        `latest ${metrics.positionPct.toFixed(1)}% through range`;
    }

    const marker =
      q(
        root,
        "[data-highlow24-range-marker]"
      );

    if (marker) {
      marker.style.left =
        metrics.positionPct.toFixed(2) +
        "%";
    }

    const change =
      q(
        root,
        "[data-highlow24-change]"
      );

    if (change) {
      change.textContent =
        signedPercent(
          metrics.changePct
        );

      change.setAttribute(
        "data-tone",
        toneFor(
          metrics.changePct
        )
      );
    }

    const source =
      state.sources.find(
        item =>
          item.id === state.sourceId
      );

    const latest =
      candles[
        candles.length - 1
      ];

    const meta =
      q(
        root,
        "[data-highlow24-meta]"
      );

    if (meta) {
      meta.textContent =
        `${source?.label || state.sourceId} · ${candles.length} completed hourly candles · ${candleFreshness(latest)}`;
    }

    const canvas =
      q(
        root,
        "[data-highlow24-chart]"
      );

    W.ZZXHighLow24Chart?.draw?.(
      canvas,
      candles,
      metrics
    );
  }

  async function refresh(
    root,
    state
  ) {
    if (!root?.isConnected) {
      return false;
    }

    if (state.busy) {
      state.queued = true;
      return false;
    }

    state.busy = true;
    state.queued = false;

    const button =
      q(
        root,
        "[data-highlow24-refresh]"
      );

    if (button) {
      button.disabled = true;
    }

    status(
      root,
      "refreshing",
      "warn"
    );

    try {
      const source =
        state.sources.find(
          item =>
            item.id === state.sourceId
        ) ||
        state.sources[0];

      if (!source) {
        throw new Error(
          "no exchange sources"
        );
      }

      const payload =
        await fetchJSON(
          source.url
        );

      const candles =
        source.normalize(
          payload
        );

      if (
        !Array.isArray(candles) ||
        candles.length < 2
      ) {
        throw new Error(
          "exchange returned no usable completed candles"
        );
      }

      state.candles =
        candles;

      state.metrics =
        calculate(
          candles
        );

      state.lastSuccessAt =
        Date.now();

      render(
        root,
        state
      );

      status(
        root,
        "live",
        "ok"
      );

      return true;

    } catch (error) {
      console.warn(
        "[high-low-24h] refresh failed",
        error
      );

      status(
        root,
        state.metrics ? "stale" : "offline",
        state.metrics ? "warn" : "error"
      );

      const meta =
        q(
          root,
          "[data-highlow24-meta]"
        );

      if (
        meta &&
        !state.metrics
      ) {
        meta.textContent =
          error?.message ||
          "high low feed unavailable";
      }

      return false;

    } finally {
      state.busy = false;

      if (button) {
        button.disabled = false;
      }

      if (
        state.queued &&
        root.isConnected
      ) {
        state.queued = false;

        W.setTimeout(
          () => refresh(root, state),
          0
        );
      }
    }
  }

  function clearRuntime(state) {
    if (state?.timer) {
      W.clearTimeout(
        state.timer
      );

      state.timer = null;
    }

    if (state?.resizeObserver) {
      try {
        state.resizeObserver.disconnect();
      } catch (_) {}

      state.resizeObserver =
        null;
    }
  }

  function startPolling(
    root,
    state
  ) {
    clearRuntime(state);

    const generation =
      ++state.generation;

    async function loop() {
      if (
        generation !== state.generation ||
        !root.isConnected
      ) {
        return;
      }

      await refresh(
        root,
        state
      );

      if (
        generation === state.generation &&
        root.isConnected
      ) {
        state.timer =
          W.setTimeout(
            loop,
            CONFIG.REFRESH_MS
          );
      }
    }

    loop();
  }

  function bindUI(
    root,
    state
  ) {
    const select =
      q(
        root,
        "[data-highlow24-source]"
      );

    if (
      select &&
      select.dataset.highlow24Bound !==
        "1"
    ) {
      select.dataset.highlow24Bound =
        "1";

      select.addEventListener(
        "change",
        () => {
          state.sourceId =
            select.value;

          safeSet(
            CONFIG.STORE_KEY,
            state.sourceId
          );

          state.candles =
            null;

          state.metrics =
            null;

          const canvas =
            q(
              root,
              "[data-highlow24-chart]"
            );

          W.ZZXHighLow24Chart?.clear?.(
            canvas
          );

          refresh(
            root,
            state
          );
        }
      );
    }

    const button =
      q(
        root,
        "[data-highlow24-refresh]"
      );

    if (
      button &&
      button.dataset.highlow24Bound !==
        "1"
    ) {
      button.dataset.highlow24Bound =
        "1";

      button.addEventListener(
        "click",
        () => refresh(root, state)
      );
    }

    if (
      typeof ResizeObserver ===
        "function" &&
      !state.resizeObserver
    ) {
      const canvas =
        q(
          root,
          "[data-highlow24-chart]"
        );

      if (canvas) {
        state.resizeObserver =
          new ResizeObserver(
            () => {
              if (
                state.candles?.length &&
                state.metrics
              ) {
                W.ZZXHighLow24Chart?.draw?.(
                  canvas,
                  state.candles,
                  state.metrics
                );
              }
            }
          );

        state.resizeObserver.observe(
          canvas
        );
      }
    }
  }

  async function boot(
    root,
    core
  ) {
    if (!root) return;

    const previous =
      root.__zzxHighLow24State;

    if (previous) {
      clearRuntime(
        previous
      );
    }

    const state = {
      core:
        core ||
        W.ZZXWidgetsCore ||
        null,

      sources: [],
      sourceId: "",
      candles: null,
      metrics: null,
      lastSuccessAt: 0,
      busy: false,
      queued: false,
      timer: null,
      resizeObserver: null,
      generation: 0
    };

    root.__zzxHighLow24State =
      state;

    try {
      await ensureModules(
        state.core
      );

      state.sources =
        W.ZZXHighLow24Sources.list();

      if (!state.sources.length) {
        throw new Error(
          "no exchange sources registered"
        );
      }

      const saved =
        safeGet(
          CONFIG.STORE_KEY
        );

      state.sourceId =
        saved &&
        state.sources.some(
          source =>
            source.id === saved
        )
          ? saved
          : state.sources[0].id;

      populateSources(
        root,
        state.sources,
        state.sourceId
      );

      bindUI(
        root,
        state
      );

      startPolling(
        root,
        state
      );

    } catch (error) {
      console.warn(
        "[high-low-24h] boot failed",
        error
      );

      status(
        root,
        "offline",
        "error"
      );

      const meta =
        q(
          root,
          "[data-highlow24-meta]"
        );

      if (meta) {
        meta.textContent =
          error?.message ||
          "widget unavailable";
      }
    }
  }

  if (W.ZZXAPI?.register) {
    W.ZZXAPI.register(
      ID,
      boot
    );

  } else if (
    W.ZZXWidgetsCore?.onMount
  ) {
    W.ZZXWidgetsCore.onMount(
      ID,
      boot
    );

  } else if (
    W.ZZXWidgets?.register
  ) {
    W.ZZXWidgets.register(
      ID,
      boot
    );
  }
})();
