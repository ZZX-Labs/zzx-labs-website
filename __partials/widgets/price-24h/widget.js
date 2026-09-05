// __partials/widgets/price-24h/widget.js
// Primary controller. This is the only JS entry point loaded by widget-core.

(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "price-24h";

  const CONFIG = Object.freeze({
    STORE_KEY: "zzx.widget.price-24h.exchange",
    REFRESH_MS: 30_000,
    MODULE_VERSION: 3
  });

  const MODULES = [
    ["ZZXMarket24Fetch", "fetch.js"],
    ["ZZXMarket24Sources", "sources.js"],
    ["ZZXMarket24Plotter", "plotter.js"],
    ["ZZXMarket24Spark", "spark.js"],
    ["ZZXMarket24Chart", "chart.js"]
  ];

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function qa(root, selector) {
    return root ? [...root.querySelectorAll(selector)] : [];
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

  function formatCompactUSD(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    try {
      return n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        notation: Math.abs(n) >= 1_000_000 ? "compact" : "standard",
        maximumFractionDigits: Math.abs(n) >= 1_000_000 ? 2 : 0
      });
    } catch (_) {
      return "$" + Math.round(n).toLocaleString();
    }
  }

  function formatBTC(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";

    return n.toLocaleString(undefined, {
      maximumFractionDigits:
        n >= 10000 ? 0 :
        n >= 1000 ? 1 :
        n >= 100 ? 2 :
        3
    }) + " BTC";
  }

  function signedPercent(value) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return sign + Math.abs(n).toFixed(2) + "%";
  }

  function timeLabel(timestamp) {
    const ts = finite(timestamp);
    if (!Number.isFinite(ts)) return "—";

    try {
      return new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return new Date(ts).toString();
    }
  }

  function safeGet(key) {
    try { return W.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { W.localStorage.setItem(key, value); }
    catch (_) {}
  }

  function widgetBase(core) {
    if (core?.widgetBase) {
      return String(core.widgetBase(ID)).replace(/\/+$/g, "");
    }

    return "/__partials/widgets/" + ID;
  }

  function assetURL(core, relativePath) {
    const path =
      widgetBase(core) +
      "/" +
      String(relativePath).replace(/^\/+/g, "");

    if (core?.url) return core.url(path);
    if (W.ZZXAPI?.url) return W.ZZXAPI.url(path);
    return path;
  }

  function moduleVersion(name) {
    return Number(W[name]?.__version || 0);
  }

  async function loadScriptOnce(core, globalName, relativePath) {
    if (moduleVersion(globalName) >= CONFIG.MODULE_VERSION) return true;

    const src = assetURL(core, relativePath);
    const key =
      ("market24:" + relativePath + ":" + CONFIG.MODULE_VERSION)
        .replace(/[^a-z0-9:_-]/gi, "_");

    if (core?.ensureScriptOnce) {
      await core.ensureScriptOnce(key, src);
      return moduleVersion(globalName) >= CONFIG.MODULE_VERSION;
    }

    let existing =
      D.querySelector('script[data-market24-module="' + key + '"]');

    if (existing?.dataset.failed === "1") {
      existing.remove();
      existing = null;
    }

    if (existing) {
      await new Promise(resolve => {
        if (existing.dataset.loaded === "1") {
          resolve();
          return;
        }

        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
      });

      return moduleVersion(globalName) >= CONFIG.MODULE_VERSION;
    }

    await new Promise(resolve => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute("data-market24-module", key);

      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve();
      }, { once: true });

      script.addEventListener("error", () => {
        script.dataset.failed = "1";
        resolve();
      }, { once: true });

      (D.head || D.documentElement).appendChild(script);
    });

    return moduleVersion(globalName) >= CONFIG.MODULE_VERSION;
  }

  async function ensureModules(core) {
    for (const [globalName, relativePath] of MODULES) {
      const ok = await loadScriptOnce(core, globalName, relativePath);

      if (!ok) {
        throw new Error(relativePath + " unavailable");
      }
    }
  }

  function setText(root, selector, value) {
    const el = q(root, selector);
    if (el) el.textContent = value == null ? "—" : String(value);
  }

  function setMetric(root, index, label, value, tone) {
    const labelEl =
      q(root, '[data-market24-metric-label="' + index + '"]');

    const valueEl =
      q(root, '[data-market24-metric-value="' + index + '"]');

    if (labelEl) labelEl.textContent = label;
    if (valueEl) {
      valueEl.textContent = value;
      if (tone) valueEl.setAttribute("data-tone", tone);
      else valueEl.removeAttribute("data-tone");
    }
  }

  function setLegend(root, labels) {
    qa(root, "[data-market24-legend]").forEach((item, index) => {
      const label = labels[index] || "";
      const text = item.querySelector("b");

      item.hidden = !label;
      if (text) text.textContent = label;
    });
  }

  function tone(value) {
    const n = finite(value);
    if (!Number.isFinite(n) || Math.abs(n) < 0.000001) return "flat";
    return n > 0 ? "up" : "down";
  }

  function sumVolume(candles) {
    return (Array.isArray(candles) ? candles : []).reduce((sum, candle) => {
      const v = finite(candle?.v);
      return sum + (Number.isFinite(v) ? Math.max(0, v) : 0);
    }, 0);
  }

  function usdNotional(candles) {
    return (Array.isArray(candles) ? candles : []).reduce((sum, candle) => {
      const v = finite(candle?.v);
      const prices = [
        finite(candle?.o),
        finite(candle?.h),
        finite(candle?.l),
        finite(candle?.c)
      ].filter(Number.isFinite);

      if (!Number.isFinite(v) || !prices.length) return sum;

      const typical =
        prices.reduce((a, b) => a + b, 0) /
        prices.length;

      return sum + Math.max(0, v) * typical;
    }, 0);
  }

  function extrema(candles, key) {
    let high = { value: -Infinity, index: -1, candle: null };
    let low = { value: Infinity, index: -1, candle: null };

    candles.forEach((candle, index) => {
      const value = finite(candle?.[key]);
      if (!Number.isFinite(value)) return;

      if (value > high.value) high = { value, index, candle };
      if (value < low.value) low = { value, index, candle };
    });

    return { high, low };
  }

  function currentWindow(series, volumeMode) {
    const candles =
      W.ZZXMarket24Sources.normalizeCandles(
        Array.isArray(series) ? series : []
      );

    if (!candles.length) {
      return {
        current: [],
        previous: [],
        priorRolling: null,
        volumeMode
      };
    }

    if (volumeMode === "rolling24h") {
      const latestT =
        candles[
          candles.length - 1
        ].t;

      const current =
        W.ZZXMarket24Sources.sliceByHours(
          candles,
          24,
          latestT
        );

      const priorTarget =
        latestT -
        24 *
        W.ZZXMarket24Sources.HOUR_MS;

      const priorRolling =
        W.ZZXMarket24Sources.nearestAtOrBefore(
          candles,
          priorTarget
        );

      const previous =
        W.ZZXMarket24Sources.sliceByHours(
          candles,
          24,
          priorTarget
        );

      return {
        current,
        previous,
        priorRolling,
        volumeMode
      };
    }

    return {
      current: candles.slice(-24),
      previous:
        candles.length >= 48
          ? candles.slice(-48, -24)
          : [],
      priorRolling: null,
      volumeMode
    };
  }

  function buildModel(kind, seriesResult, summary) {
    const windows =
      currentWindow(
        seriesResult?.candles || [],
        seriesResult?.volumeMode || "hourly"
      );

    const current = windows.current;

    if (current.length < 2) {
      throw new Error("insufficient 24h series");
    }

    const first = current[0];
    const last = current[current.length - 1];

    const open = finite(first?.o);
    const close = finite(last?.c);
    const priceHigh = extrema(current, "h");
    const priceLow = extrema(current, "l");
    const volumeExt = extrema(current, "v");

    let volume24;
    let priorVolume24 = NaN;
    let volumeDelta = NaN;

    if (windows.volumeMode === "rolling24h") {
      volume24 =
        Number.isFinite(finite(summary?.volume_24h_btc))
          ? finite(summary.volume_24h_btc)
          : finite(last?.v);

      const priorRolling =
        finite(
          windows.priorRolling?.v
        );

      if (
        Number.isFinite(priorRolling) &&
        priorRolling > 0
      ) {
        priorVolume24 =
          priorRolling;

        volumeDelta =
          (
            (
              volume24 -
              priorVolume24
            ) /
            priorVolume24
          ) *
          100;
      }
    } else {
      volume24 = sumVolume(current);

      if (windows.previous.length === 24) {
        priorVolume24 = sumVolume(windows.previous);

        if (priorVolume24 > 0) {
          volumeDelta =
            ((volume24 - priorVolume24) / priorVolume24) *
            100;
        }
      }
    }

    const priceDelta =
      Number.isFinite(open) &&
      Number.isFinite(close) &&
      open > 0
        ? ((close - open) / open) * 100
        : NaN;

    const model = {
      kind,
      candles: current,
      seriesMode: windows.volumeMode,
      summary,
      open,
      close,
      priceDelta,
      priceHigh,
      priceLow,
      volume24,
      priorVolume24,
      volumeDelta,
      usdNotional:
        Number.isFinite(finite(summary?.volume_24h_usd))
          ? finite(summary.volume_24h_usd)
          : usdNotional(current),
      volumeHigh: volumeExt.high,
      volumeLow: volumeExt.low,
      averageVolume:
        windows.volumeMode === "hourly"
          ? volume24 / current.length
          : NaN
    };

    return model;
  }

  function kindFromRoot(root) {
    return (
      q(root, "[data-market24-kind]")?.getAttribute("data-market24-kind") ||
      "price"
    );
  }

  function renderPrice(root, model) {
    setText(root, "[data-market24-title]", "24h Price");
    setText(root, "[data-market24-eyebrow]", "BTC / USD · same exchange family");
    setText(root, "[data-market24-primary-label]", "latest price");
    setText(root, "[data-market24-primary]", formatUSD(model.close));
    setText(root, "[data-market24-secondary-label]", "24h change");
    setText(root, "[data-market24-secondary]", signedPercent(model.priceDelta));

    const secondary = q(root, ".market24__secondary");
    if (secondary) secondary.setAttribute("data-market24-tone", tone(model.priceDelta));

    const rangeAbs =
      model.priceHigh.high.value -
      model.priceLow.low.value;

    const rangePct =
      model.priceLow.low.value > 0
        ? (rangeAbs / model.priceLow.low.value) * 100
        : NaN;

    setMetric(root, 0, "24h open", formatUSD(model.open));
    setMetric(root, 1, "24h high", formatUSD(model.priceHigh.high.value), "high");
    setMetric(root, 2, "24h low", formatUSD(model.priceLow.low.value), "low");
    setMetric(
      root,
      3,
      "range",
      Number.isFinite(rangePct)
        ? formatUSD(rangeAbs) + " · " + rangePct.toFixed(2) + "%"
        : "—"
    );

    setLegend(root, [
      "price up",
      "price down",
      "24h high",
      "24h low"
    ]);

    setText(
      root,
      "[data-market24-note]",
      "Price segments are green when price rises and red when price falls."
    );
  }

  function renderVolume(root, model) {
    setText(root, "[data-market24-title]", "24h Volume");
    setText(root, "[data-market24-eyebrow]", "BTC / USD · same exchange family");
    setText(root, "[data-market24-primary-label]", "24h BTC volume");
    setText(root, "[data-market24-primary]", formatBTC(model.volume24));
    setText(root, "[data-market24-secondary-label]", "vs previous 24h");
    setText(root, "[data-market24-secondary]", signedPercent(model.volumeDelta));

    const secondary = q(root, ".market24__secondary");
    if (secondary) secondary.setAttribute("data-market24-tone", tone(model.volumeDelta));

    setMetric(root, 0, "USD notional", formatCompactUSD(model.usdNotional));

    setMetric(
      root,
      1,
      model.seriesMode === "hourly" ? "average / hour" : "series mode",
      model.seriesMode === "hourly"
        ? formatBTC(model.averageVolume)
        : "rolling 24h"
    );

    setMetric(
      root,
      2,
      model.seriesMode === "hourly" ? "volume high / hour" : "volume high / sample",
      formatBTC(model.volumeHigh.value),
      "high"
    );

    setMetric(
      root,
      3,
      model.seriesMode === "hourly" ? "volume low / hour" : "volume low / sample",
      formatBTC(model.volumeLow.value),
      "low"
    );

    setLegend(root, [
      "volume up",
      "volume down",
      "volume high",
      "volume low"
    ]);

    setText(
      root,
      "[data-market24-note]",
      model.seriesMode === "hourly"
        ? "Each volume bar is green when hourly BTC volume rises versus the prior hour and red when it falls."
        : "Aggregate sources expose rolling 24h volume samples; green/red compares each sample with the prior sample."
    );
  }

  function renderCombo(root, model) {
    setText(root, "[data-market24-title]", "24h High / Low");
    setText(root, "[data-market24-eyebrow]", "BTC / USD · price + volume extremes");
    setText(root, "[data-market24-primary-label]", "price H / L");
    setText(
      root,
      "[data-market24-primary]",
      formatUSD(model.priceHigh.high.value) +
      " / " +
      formatUSD(model.priceLow.low.value)
    );

    setText(root, "[data-market24-secondary-label]", "volume H / L");
    setText(
      root,
      "[data-market24-secondary]",
      formatBTC(model.volumeHigh.value) +
      " / " +
      formatBTC(model.volumeLow.value)
    );

    const secondary = q(root, ".market24__secondary");
    if (secondary) secondary.setAttribute("data-market24-tone", "gold");

    setMetric(
      root,
      0,
      "price high",
      formatUSD(model.priceHigh.high.value) +
      " · " +
      timeLabel(model.priceHigh.high.candle?.t),
      "high"
    );

    setMetric(
      root,
      1,
      "price low",
      formatUSD(model.priceLow.low.value) +
      " · " +
      timeLabel(model.priceLow.low.candle?.t),
      "low"
    );

    setMetric(
      root,
      2,
      model.seriesMode === "hourly" ? "volume high / hour" : "volume high / sample",
      formatBTC(model.volumeHigh.value) +
      " · " +
      timeLabel(model.volumeHigh.candle?.t),
      "up"
    );

    setMetric(
      root,
      3,
      model.seriesMode === "hourly" ? "volume low / hour" : "volume low / sample",
      formatBTC(model.volumeLow.value) +
      " · " +
      timeLabel(model.volumeLow.candle?.t),
      "low"
    );

    setLegend(root, [
      "price up / vol up",
      "price down / vol down",
      "price H / L",
      "volume H / L"
    ]);

    setText(
      root,
      "[data-market24-note]",
      "Combined chart uses green/red price segments, green/red volume bars, and separate price/volume H/L markers."
    );
  }

  function render(root, state) {
    const model = state.model;
    if (!model) return;

    if (state.kind === "price") renderPrice(root, model);
    else if (state.kind === "volume") renderVolume(root, model);
    else renderCombo(root, model);

    const source =
      state.catalog.find(item => item.id === state.sourceId);

    setText(
      root,
      "[data-market24-meta]",
      (source?.label || state.sourceId) +
      " · " +
      model.candles.length +
      (
        model.seriesMode === "hourly"
          ? " completed hourly candles · "
          : " samples in trailing 24h · "
      ) +
      model.seriesMode
    );

    const canvas = q(root, "[data-market24-chart]");
    W.ZZXMarket24Chart.draw(canvas, state.kind, model);
  }

  function status(root, text, state) {
    const el = q(root, "[data-market24-status]");
    if (!el) return;

    el.textContent = text;
    el.setAttribute("data-status", state || "offline");
  }

  function populateCatalog(root, state) {
    const select = q(root, "[data-market24-source]");
    if (!select) return;

    select.replaceChildren();

    for (const source of state.catalog) {
      const option = D.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      select.appendChild(option);
    }

    select.value = state.sourceId;
  }

  async function refresh(root, state) {
    if (!root?.isConnected) return false;

    if (state.busy) {
      state.queued = true;
      return false;
    }

    state.busy = true;
    state.queued = false;

    const button = q(root, "[data-market24-refresh]");
    if (button) button.disabled = true;

    status(root, "refreshing", "warn");

    try {
      const [latestPayload, seriesResult] = await Promise.all([
        W.ZZXMarket24Sources.latest(W.ZZXMarket24Fetch).catch(() => null),
        W.ZZXMarket24Sources.series(state.sourceId, W.ZZXMarket24Fetch)
      ]);

      const summary =
        W.ZZXMarket24Sources.summaryFromLatest(
          latestPayload,
          state.sourceId
        );

      state.model =
        buildModel(
          state.kind,
          seriesResult,
          summary
        );

      render(root, state);

      status(
        root,
        summary?.error ? "series live" : "live",
        summary?.error ? "warn" : "ok"
      );

      return true;
    } catch (error) {
      console.warn("[" + ID + "] refresh failed", error);

      status(
        root,
        state.model ? "stale" : "offline",
        state.model ? "warn" : "error"
      );

      if (!state.model) {
        setText(
          root,
          "[data-market24-meta]",
          error?.message || "market data unavailable"
        );
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

  function clearRuntime(state) {
    if (state?.timer) {
      W.clearTimeout(state.timer);
      state.timer = null;
    }

    if (state?.resizeObserver) {
      try { state.resizeObserver.disconnect(); }
      catch (_) {}

      state.resizeObserver = null;
    }
  }

  function startPolling(root, state) {
    clearRuntime(state);

    const generation = ++state.generation;

    async function loop() {
      if (
        generation !== state.generation ||
        !root.isConnected
      ) return;

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
    const select = q(root, "[data-market24-source]");

    if (select && select.dataset.market24Bound !== "1") {
      select.dataset.market24Bound = "1";

      select.addEventListener("change", () => {
        state.sourceId = select.value;
        safeSet(CONFIG.STORE_KEY, state.sourceId);
        state.model = null;

        const canvas = q(root, "[data-market24-chart]");
        W.ZZXMarket24Chart?.clear?.(canvas);

        refresh(root, state);
      });
    }

    const button = q(root, "[data-market24-refresh]");

    if (button && button.dataset.market24Bound !== "1") {
      button.dataset.market24Bound = "1";
      button.addEventListener("click", () => refresh(root, state));
    }

    if (typeof ResizeObserver === "function") {
      const canvas = q(root, "[data-market24-chart]");

      if (canvas) {
        state.resizeObserver = new ResizeObserver(() => {
          if (state.model) {
            W.ZZXMarket24Chart?.draw?.(
              canvas,
              state.kind,
              state.model
            );
          }
        });

        state.resizeObserver.observe(canvas);
      }
    }
  }

  async function boot(root, core) {
    if (!root) return;

    const old = root.__zzxMarket24State;
    if (old) clearRuntime(old);

    const state = {
      core: core || W.ZZXWidgetsCore || null,
      kind: kindFromRoot(root),
      catalog: [],
      sourceId: "",
      model: null,
      busy: false,
      queued: false,
      timer: null,
      resizeObserver: null,
      generation: 0
    };

    root.__zzxMarket24State = state;

    try {
      await ensureModules(state.core);

      const result =
        await W.ZZXMarket24Sources.catalog(
          W.ZZXMarket24Fetch
        );

      state.catalog = result.catalog;

      if (!state.catalog.length) {
        throw new Error("exchange catalog unavailable");
      }

      const saved = safeGet(CONFIG.STORE_KEY);

      state.sourceId =
        saved &&
        state.catalog.some(item => item.id === saved)
          ? saved
          : (
              state.catalog.some(item => item.id === "zzx")
                ? "zzx"
                : state.catalog[0].id
            );

      populateCatalog(root, state);
      bindUI(root, state);
      startPolling(root, state);

    } catch (error) {
      console.warn("[" + ID + "] boot failed", error);
      status(root, "offline", "error");

      setText(
        root,
        "[data-market24-meta]",
        error?.message || "widget unavailable"
      );
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
