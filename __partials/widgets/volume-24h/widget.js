// __partials/widgets/volume-24h/widget.js
// Primary controller for the 24h Volume widget.
// Loads local js/sources.js and js/chart.js.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "volume-24h";

  const CONFIG = Object.freeze({
    STORE_KEY: "zzx.widget.volume-24h.exchange",
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

  function formatBTC(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    const maximumFractionDigits =
      n >= 10_000 ? 0 :
      n >= 1_000 ? 1 :
      n >= 100 ? 2 :
      3;

    return (
      n.toLocaleString(undefined, {
        maximumFractionDigits
      }) +
      " BTC"
    );
  }

  function formatCompactBTC(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    return (
      n.toLocaleString(undefined, {
        maximumFractionDigits: n >= 100 ? 1 : 2
      }) +
      " BTC"
    );
  }

  function formatUSD(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    try {
      return n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        notation: n >= 1_000_000 ? "compact" : "standard",
        maximumFractionDigits: n >= 1_000_000 ? 2 : 0
      });
    } catch (_) {
      return "$" + Math.round(n).toLocaleString();
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

    return "/__partials/widgets/volume-24h";
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
      D.querySelector(`script[data-volume24-module="${key}"]`);

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
      script.setAttribute("data-volume24-module", key);

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
    if (!W.ZZXVolume24Sources?.list) {
      const ok = await loadScriptOnce(core, "js/sources.js");

      if (!ok || !W.ZZXVolume24Sources?.list) {
        throw new Error("sources module unavailable");
      }
    }

    if (!W.ZZXVolume24Chart?.draw) {
      const ok = await loadScriptOnce(core, "js/chart.js");

      if (!ok || !W.ZZXVolume24Chart?.draw) {
        throw new Error("chart module unavailable");
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => W.setTimeout(resolve, ms));
  }

  async function fetchJSON(url) {
    if (W.ZZXAPI?.fetchRaw) {
      const response = await W.ZZXAPI.fetchRaw(url, {
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
        const response = await fetch(url, {
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

        if (attempt < CONFIG.REQUEST_RETRIES) {
          await sleep(CONFIG.RETRY_DELAY_MS);
        }

      } finally {
        if (timer) W.clearTimeout(timer);
      }
    }

    throw (
      lastError ||
      new Error(`request failed: ${url}`)
    );
  }

  function sumBTC(candles) {
    return (Array.isArray(candles) ? candles : []).reduce(
      (sum, candle) => {
        const volume = finite(candle?.v);
        return sum + (Number.isFinite(volume) ? volume : 0);
      },
      0
    );
  }

  function typicalPrice(candle) {
    const values = [
      finite(candle?.o),
      finite(candle?.h),
      finite(candle?.l),
      finite(candle?.c)
    ].filter(Number.isFinite);

    if (!values.length) return NaN;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sumUSDNotional(candles) {
    return (Array.isArray(candles) ? candles : []).reduce(
      (sum, candle) => {
        const volume = finite(candle?.v);
        const price = typicalPrice(candle);

        if (
          !Number.isFinite(volume) ||
          !Number.isFinite(price)
        ) {
          return sum;
        }

        return sum + volume * price;
      },
      0
    );
  }

  function calculate(candles48) {
    if (!Array.isArray(candles48) || candles48.length < 24) {
      throw new Error("insufficient completed hourly candles");
    }

    const current =
      candles48.slice(-24);

    const previous =
      candles48.length >= 48
        ? candles48.slice(-48, -24)
        : [];

    const currentBTC = sumBTC(current);
    const previousBTC =
      previous.length === 24
        ? sumBTC(previous)
        : NaN;

    const deltaPct =
      Number.isFinite(previousBTC) &&
      previousBTC > 0
        ? ((currentBTC - previousBTC) / previousBTC) * 100
        : NaN;

    const usdNotional =
      sumUSDNotional(current);

    const averageBTC =
      currentBTC / current.length;

    let peak = null;

    for (const candle of current) {
      const volume = finite(candle?.v);

      if (
        Number.isFinite(volume) &&
        (
          !peak ||
          volume > peak.volume
        )
      ) {
        peak = {
          volume,
          t: finite(candle?.t)
        };
      }
    }

    return {
      current,
      previous,
      currentBTC,
      previousBTC,
      deltaPct,
      usdNotional,
      averageBTC,
      peak,
      comparisonReady: previous.length === 24
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

  function hourLabel(timestampMs) {
    const ts = finite(timestampMs);

    if (!Number.isFinite(ts)) return "—";

    const date = new Date(ts);

    try {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return date.toString();
    }
  }

  function candleFreshness(candle) {
    const ts = finite(candle?.t);

    if (!Number.isFinite(ts)) {
      return "timestamp unavailable";
    }

    // Candle timestamp is the start of the completed hourly bucket.
    const completedAt =
      ts +
      (W.ZZXVolume24Sources?.HOUR_MS || 3_600_000);

    const ageSec =
      Math.max(
        0,
        Math.round(
          (Date.now() - completedAt) / 1000
        )
      );

    if (ageSec < 60) return `${ageSec}s since last completed hour`;
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m since last completed hour`;

    return `${Math.floor(ageSec / 3600)}h since last completed hour`;
  }

  function populateSources(root, sources, selected) {
    const select =
      q(root, "[data-volume24-source]");

    if (!select) return;

    select.replaceChildren();

    for (const source of sources) {
      const option =
        D.createElement("option");

      option.value =
        source.id;

      option.textContent =
        source.label;

      select.appendChild(option);
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

  function status(root, label, state) {
    const el =
      q(root, "[data-volume24-status]");

    if (!el) return;

    el.textContent = label;
    el.setAttribute(
      "data-status",
      state || "offline"
    );
  }

  function render(root, state) {
    const metrics =
      state.metrics;

    if (!metrics) return;

    const volume =
      q(root, "[data-volume24-btc]");

    if (volume) {
      volume.textContent =
        formatBTC(metrics.currentBTC);
    }

    const change =
      q(root, "[data-volume24-change]");

    if (change) {
      change.textContent =
        metrics.comparisonReady
          ? signedPercent(metrics.deltaPct)
          : "—";
    }

    const changeWrap =
      q(root, ".volume24__change");

    if (changeWrap) {
      changeWrap.setAttribute(
        "data-volume24-tone",
        metrics.comparisonReady
          ? toneFor(metrics.deltaPct)
          : "flat"
      );
    }

    const usd =
      q(root, "[data-volume24-usd]");

    if (usd) {
      usd.textContent =
        formatUSD(metrics.usdNotional);
    }

    const average =
      q(root, "[data-volume24-average]");

    if (average) {
      average.textContent =
        formatCompactBTC(metrics.averageBTC);
    }

    const peak =
      q(root, "[data-volume24-peak]");

    if (peak) {
      peak.textContent =
        metrics.peak
          ? `${formatCompactBTC(metrics.peak.volume)} · ${hourLabel(metrics.peak.t)}`
          : "—";
    }

    const source =
      state.sources.find(
        item =>
          item.id === state.sourceId
      );

    const latest =
      metrics.current[
        metrics.current.length - 1
      ];

    const meta =
      q(root, "[data-volume24-meta]");

    if (meta) {
      meta.textContent =
        `${source?.label || state.sourceId} · 24 completed hourly candles · ${candleFreshness(latest)}`;
    }

    const canvas =
      q(root, "[data-volume24-chart]");

    W.ZZXVolume24Chart?.draw?.(
      canvas,
      metrics.current
    );
  }

  async function refresh(root, state) {
    if (!root?.isConnected) return false;

    if (state.busy) {
      state.queued = true;
      return false;
    }

    state.busy = true;
    state.queued = false;

    const button =
      q(root, "[data-volume24-refresh]");

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

      const candles48 =
        source.normalize(
          payload
        );

      const metrics =
        calculate(
          candles48
        );

      state.candles48 =
        candles48;

      state.metrics =
        metrics;

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
        "[volume-24h] refresh failed",
        error
      );

      status(
        root,
        state.metrics ? "stale" : "offline",
        state.metrics ? "warn" : "error"
      );

      const meta =
        q(root, "[data-volume24-meta]");

      if (
        meta &&
        !state.metrics
      ) {
        meta.textContent =
          error?.message ||
          "volume feed unavailable";
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

      state.resizeObserver = null;
    }
  }

  function startPolling(root, state) {
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

  function bindUI(root, state) {
    const select =
      q(root, "[data-volume24-source]");

    if (
      select &&
      select.dataset.volume24Bound !==
        "1"
    ) {
      select.dataset.volume24Bound =
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

          state.candles48 =
            null;

          state.metrics =
            null;

          const canvas =
            q(
              root,
              "[data-volume24-chart]"
            );

          W.ZZXVolume24Chart?.clear?.(
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
      q(root, "[data-volume24-refresh]");

    if (
      button &&
      button.dataset.volume24Bound !==
        "1"
    ) {
      button.dataset.volume24Bound =
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
          "[data-volume24-chart]"
        );

      if (canvas) {
        state.resizeObserver =
          new ResizeObserver(
            () => {
              if (state.metrics?.current?.length) {
                W.ZZXVolume24Chart?.draw?.(
                  canvas,
                  state.metrics.current
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

  async function boot(root, core) {
    if (!root) return;

    const previous =
      root.__zzxVolume24State;

    if (previous) {
      clearRuntime(previous);
    }

    const state = {
      core:
        core ||
        W.ZZXWidgetsCore ||
        null,

      sources: [],
      sourceId: "",
      candles48: null,
      metrics: null,
      lastSuccessAt: 0,
      busy: false,
      queued: false,
      timer: null,
      resizeObserver: null,
      generation: 0
    };

    root.__zzxVolume24State =
      state;

    try {
      await ensureModules(
        state.core
      );

      state.sources =
        W.ZZXVolume24Sources.list();

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
        "[volume-24h] boot failed",
        error
      );

      status(
        root,
        "offline",
        "error"
      );

      const meta =
        q(root, "[data-volume24-meta]");

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
