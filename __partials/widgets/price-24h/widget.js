// __partials/widgets/price-24h/widget.js
// Primary controller for the 24h Price widget.
// Loads local js/sources.js and js/chart.js.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "price-24h";

  const CONFIG = Object.freeze({
    STORE_KEY: "zzx.widget.price-24h.exchange",
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

  function money(value) {
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

  function signedMoney(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    const abs = money(Math.abs(n));
    if (n > 0) return "+" + abs;
    if (n < 0) return "−" + abs;
    return abs;
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

    return "/__partials/widgets/price-24h";
  }

  function assetURL(core, relativePath) {
    const path = `${widgetBase(core)}/${String(relativePath).replace(/^\/+/g, "")}`;

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

    let existing = D.querySelector(`script[data-price24-module="${key}"]`);

    if (existing?.dataset.loaded === "1") return true;

    if (existing?.dataset.failed === "1") {
      existing.remove();
      existing = null;
    }

    if (existing) {
      return await new Promise(resolve => {
        const done = ok => resolve(Boolean(ok));
        existing.addEventListener("load", () => done(true), { once: true });
        existing.addEventListener("error", () => done(false), { once: true });
      });
    }

    return await new Promise(resolve => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute("data-price24-module", key);

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
    if (!W.ZZXPrice24Sources?.list) {
      const ok = await loadScriptOnce(core, "js/sources.js");
      if (!ok || !W.ZZXPrice24Sources?.list) {
        throw new Error("sources module unavailable");
      }
    }

    if (!W.ZZXPrice24Chart?.draw) {
      const ok = await loadScriptOnce(core, "js/chart.js");
      if (!ok || !W.ZZXPrice24Chart?.draw) {
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

    for (let attempt = 0; attempt <= CONFIG.REQUEST_RETRIES; attempt++) {
      const controller =
        typeof AbortController === "function"
          ? new AbortController()
          : null;

      const timer = controller
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
          const error = new Error(`HTTP ${response.status} for ${url}`);
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

    throw lastError || new Error(`request failed: ${url}`);
  }

  function toneFor(value) {
    const n = finite(value);
    if (!Number.isFinite(n) || Math.abs(n) < 0.000001) return "flat";
    return n > 0 ? "up" : "down";
  }

  function calculate(candles) {
    if (!Array.isArray(candles) || candles.length < 2) {
      throw new Error("insufficient 24h candle data");
    }

    const first = candles[0];
    const last = candles[candles.length - 1];

    const open = finite(first.o);
    const close = finite(last.c);

    if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0) {
      throw new Error("invalid price candles");
    }

    const changeAbs = close - open;
    const changePct = (changeAbs / open) * 100;

    const highs = candles.map(c => finite(c.h)).filter(Number.isFinite);
    const lows = candles.map(c => finite(c.l)).filter(Number.isFinite);

    const high = highs.length ? Math.max(...highs) : close;
    const low = lows.length ? Math.min(...lows) : close;
    const spanPct = low > 0 ? ((high - low) / low) * 100 : NaN;

    return {
      open,
      close,
      changeAbs,
      changePct,
      high,
      low,
      spanPct,
      tone: toneFor(changeAbs)
    };
  }

  function populateSources(root, sources, selected) {
    const select = q(root, "[data-price24-source]");
    if (!select) return;

    select.replaceChildren();

    for (const source of sources) {
      const option = D.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      select.appendChild(option);
    }

    if (sources.some(source => source.id === selected)) {
      select.value = selected;
    }
  }

  function status(root, label, state) {
    const el = q(root, "[data-price24-status]");
    if (!el) return;

    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  function candleFreshness(candle) {
    const ts = finite(candle?.t);
    if (!Number.isFinite(ts)) return "timestamp unavailable";

    const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));

    if (ageSec < 60) return `${ageSec}s old`;
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m old`;
    return `${Math.floor(ageSec / 3600)}h old`;
  }

  function render(root, state) {
    if (!state.candles?.length || !state.metrics) return;

    const metrics = state.metrics;
    const latest = state.candles[state.candles.length - 1];

    const price = q(root, "[data-price24-price]");
    if (price) price.textContent = money(metrics.close);

    const abs = q(root, "[data-price24-change-abs]");
    if (abs) abs.textContent = signedMoney(metrics.changeAbs);

    const pct = q(root, "[data-price24-change-pct]");
    if (pct) pct.textContent = signedPercent(metrics.changePct);

    const change = q(root, ".price24__change");
    if (change) change.setAttribute("data-price24-tone", metrics.tone);

    const open = q(root, "[data-price24-open]");
    if (open) open.textContent = money(metrics.open);

    const close = q(root, "[data-price24-close]");
    if (close) close.textContent = money(metrics.close);

    const span = q(root, "[data-price24-span]");
    if (span) span.textContent = Number.isFinite(metrics.spanPct)
      ? metrics.spanPct.toFixed(2) + "%"
      : "—";

    const source = state.sources.find(item => item.id === state.sourceId);
    const meta = q(root, "[data-price24-meta]");
    if (meta) {
      meta.textContent =
        `${source?.label || state.sourceId} · ${state.candles.length} hourly points · ${candleFreshness(latest)}`;
    }

    const canvas = q(root, "[data-price24-chart]");
    W.ZZXPrice24Chart?.draw?.(canvas, state.candles, metrics.tone);
  }

  async function refresh(root, state) {
    if (!root?.isConnected) return false;

    if (state.busy) {
      state.queued = true;
      return false;
    }

    state.busy = true;
    state.queued = false;

    const button = q(root, "[data-price24-refresh]");
    if (button) button.disabled = true;

    status(root, "refreshing", "warn");

    try {
      const source =
        state.sources.find(item => item.id === state.sourceId) ||
        state.sources[0];

      if (!source) throw new Error("no exchange sources");

      const payload = await fetchJSON(source.url);
      const candles = source.normalize(payload);

      if (!Array.isArray(candles) || candles.length < 2) {
        throw new Error("exchange returned no usable candles");
      }

      state.candles = candles;
      state.metrics = calculate(candles);
      state.lastSuccessAt = Date.now();

      render(root, state);
      status(root, "live", "ok");

      return true;
    } catch (error) {
      console.warn("[price-24h] refresh failed", error);

      status(
        root,
        state.candles?.length ? "stale" : "offline",
        state.candles?.length ? "warn" : "error"
      );

      const meta = q(root, "[data-price24-meta]");
      if (meta && !state.candles?.length) {
        meta.textContent = error?.message || "price feed unavailable";
      }

      return false;
    } finally {
      state.busy = false;
      if (button) button.disabled = false;

      if (state.queued && root.isConnected) {
        state.queued = false;
        W.setTimeout(() => refresh(root, state), 0);
      }
    }
  }

  function clearTimers(state) {
    if (state?.timer) {
      W.clearTimeout(state.timer);
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
    clearTimers(state);

    const generation = ++state.generation;

    async function loop() {
      if (
        generation !== state.generation ||
        !root.isConnected
      ) {
        return;
      }

      await refresh(root, state);

      if (
        generation === state.generation &&
        root.isConnected
      ) {
        state.timer = W.setTimeout(loop, CONFIG.REFRESH_MS);
      }
    }

    loop();
  }

  function bindUI(root, state) {
    const select = q(root, "[data-price24-source]");

    if (select && select.dataset.price24Bound !== "1") {
      select.dataset.price24Bound = "1";

      select.addEventListener("change", () => {
        state.sourceId = select.value;
        safeSet(CONFIG.STORE_KEY, state.sourceId);

        state.candles = null;
        state.metrics = null;

        const canvas = q(root, "[data-price24-chart]");
        W.ZZXPrice24Chart?.clear?.(canvas);

        refresh(root, state);
      });
    }

    const button = q(root, "[data-price24-refresh]");

    if (button && button.dataset.price24Bound !== "1") {
      button.dataset.price24Bound = "1";
      button.addEventListener("click", () => refresh(root, state));
    }

    if (
      typeof ResizeObserver === "function" &&
      !state.resizeObserver
    ) {
      const canvas = q(root, "[data-price24-chart]");

      if (canvas) {
        state.resizeObserver = new ResizeObserver(() => {
          if (state.candles?.length && state.metrics) {
            W.ZZXPrice24Chart?.draw?.(
              canvas,
              state.candles,
              state.metrics.tone
            );
          }
        });

        state.resizeObserver.observe(canvas);
      }
    }
  }

  async function boot(root, core) {
    if (!root) return;

    const previous = root.__zzxPrice24State;
    if (previous) clearTimers(previous);

    const state = {
      core: core || W.ZZXWidgetsCore || null,
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

    root.__zzxPrice24State = state;

    try {
      await ensureModules(state.core);

      state.sources = W.ZZXPrice24Sources.list();

      if (!state.sources.length) {
        throw new Error("no exchange sources registered");
      }

      const saved = safeGet(CONFIG.STORE_KEY);

      state.sourceId =
        saved && state.sources.some(source => source.id === saved)
          ? saved
          : state.sources[0].id;

      populateSources(root, state.sources, state.sourceId);
      bindUI(root, state);
      startPolling(root, state);

    } catch (error) {
      console.warn("[price-24h] boot failed", error);
      status(root, "offline", "error");

      const meta = q(root, "[data-price24-meta]");
      if (meta) meta.textContent = error?.message || "widget unavailable";
    }
  }

  if (W.ZZXAPI?.register) {
    W.ZZXAPI.register(ID, boot);

  } else if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, boot);

  } else if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, boot);
  }
})();
