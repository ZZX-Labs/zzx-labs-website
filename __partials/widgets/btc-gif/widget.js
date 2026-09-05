// __partials/widgets/btc-gif/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-gif";
  const LIBRARY = "/static/media/widgets/btc-gif/gifs.json";
  const AUTO_KEY = "zzx.widget.btc-gif.auto";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function safeGet(key) {
    try { return W.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { W.localStorage.setItem(key, value); }
    catch (_) {}
  }

  function status(root, label, state) {
    const el = q(root, "[data-btcgif-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function localJSON(path) {
    if (W.ZZXAPI?.jsonStrict) {
      return await W.ZZXAPI.jsonStrict(path, {
        cacheBust: false,
        timeoutMs: 8000,
        retries: 1
      });
    }

    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}`);
    return await response.json();
  }

  function randomIndex(length) {
    if (!(length > 0)) return -1;

    if (W.crypto?.getRandomValues) {
      const max = Math.floor(0x100000000 / length) * length;
      const buf = new Uint32Array(1);

      do {
        W.crypto.getRandomValues(buf);
      } while (buf[0] >= max);

      return buf[0] % length;
    }

    return 0;
  }

  async function ensureRenderer(core) {
    if (W.ZZXBTCGifRenderer?.draw) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/btc-gif";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/renderer.js`)
      : `${base}/js/renderer.js`;

    await new Promise((resolve, reject) => {
      const existing = D.querySelector('script[data-btcgif-renderer="1"]');

      if (existing) {
        if (W.ZZXBTCGifRenderer?.draw) return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.btcgifRenderer = "1";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      (D.head || D.documentElement).appendChild(script);
    });

    if (!W.ZZXBTCGifRenderer?.draw) throw new Error("GIF renderer unavailable");
  }

  function find24hReference(history, latest) {
    const now = Date.parse(latest?.updated_at || "") || Date.now();
    const target = now - 24 * 60 * 60 * 1000;

    let best = null;
    let bestDistance = Infinity;

    for (const row of Array.isArray(history) ? history : []) {
      const ts = Date.parse(row?.updated_at || "");
      const price = finite(row?.price_usd);

      if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;

      const distance = Math.abs(ts - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { ts, price };
      }
    }

    return bestDistance <= 6 * 60 * 60 * 1000 ? best : null;
  }

  function marketOverlay(latest, history) {
    const price = finite(latest?.price_usd ?? latest?.btc_usd ?? latest?.bpi_usd);
    const ref = find24hReference(history, latest);

    let delta = NaN;
    if (ref && Number.isFinite(price) && ref.price > 0) {
      delta = ((price - ref.price) / ref.price) * 100;
    }

    return {
      priceText: Number.isFinite(price)
        ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} / BTC`
        : "BTC —",
      deltaText: Number.isFinite(delta)
        ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}% / 24h`
        : "24h —",
      deltaTone: Number.isFinite(delta) ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat",
      detailText:
        `H ${Number.isFinite(finite(latest?.high_24h)) ? "$" + finite(latest.high_24h).toLocaleString(undefined,{maximumFractionDigits:0}) : "—"} · ` +
        `L ${Number.isFinite(finite(latest?.low_24h)) ? "$" + finite(latest.low_24h).toLocaleString(undefined,{maximumFractionDigits:0}) : "—"} · ` +
        `block ${Number.isFinite(finite(latest?.block_height)) ? Math.trunc(finite(latest.block_height)).toLocaleString() : "—"}`
    };
  }

  async function refreshMarket(root, state) {
    try {
      const [latest, history] = await Promise.all([
        localJSON("/bitcoin/bpi/api/latest.json"),
        localJSON("/bitcoin/bpi/api/history.json").catch(() => [])
      ]);

      state.market = marketOverlay(latest, history);
      q(root, "[data-btcgif-market]").textContent =
        `${state.market.deltaText} · ${latest?.source || "ZZX BPI"}`;
      status(root, "live", "ok");
    } catch (error) {
      status(root, state.market ? "stale" : "offline", state.market ? "warn" : "error");
      q(root, "[data-btcgif-market]").textContent = String(error?.message || error);
    }
  }

  function choose(root, state) {
    if (!state.items.length) return;

    let index = randomIndex(state.items.length);

    if (state.items.length > 1 && index === state.index) {
      index = (index + 1) % state.items.length;
    }

    state.index = index;
    const item = state.items[index];
    const img = q(root, "[data-btcgif-image]");

    if (img) {
      img.onload = () => {
        q(root, "[data-btcgif-name]").textContent = item.id || `GIF ${index + 1}`;
      };
      img.src = item.src;
    }
  }

  function scheduleAuto(root, state) {
    if (state.autoTimer) W.clearTimeout(state.autoTimer);
    state.autoTimer = null;

    const seconds = finite(q(root, "[data-btcgif-auto]")?.value);

    if (!(seconds > 0)) return;

    state.autoTimer = W.setTimeout(() => {
      if (!root.isConnected) return;
      choose(root, state);
      scheduleAuto(root, state);
    }, seconds * 1000);
  }

  function animationLoop(root, state) {
    if (!root.isConnected) return;

    const canvas = q(root, "[data-btcgif-canvas]");
    const img = q(root, "[data-btcgif-image]");

    if (!D.hidden) {
      W.ZZXBTCGifRenderer?.draw?.(canvas, img, state.market);
    }

    state.raf = W.requestAnimationFrame(() => animationLoop(root, state));
  }

  async function boot(root, core) {
    if (!root) return;

    const old = root.__zzxBTCGifState;
    if (old?.raf) W.cancelAnimationFrame(old.raf);
    if (old?.autoTimer) W.clearTimeout(old.autoTimer);
    if (old?.marketTimer) W.clearTimeout(old.marketTimer);

    const state = {
      items: [],
      index: -1,
      market: null,
      raf: 0,
      autoTimer: null,
      marketTimer: null
    };

    root.__zzxBTCGifState = state;

    try {
      await ensureRenderer(core || W.ZZXWidgetsCore || null);

      const library = await localJSON(LIBRARY);
      state.items = Array.isArray(library?.items) ? library.items.filter(x => x?.src) : [];

      if (!state.items.length) throw new Error("GIF library is empty");

      const auto = q(root, "[data-btcgif-auto]");
      const saved = safeGet(AUTO_KEY);
      if (saved && [...auto.options].some(o => o.value === saved)) auto.value = saved;

      q(root, "[data-btcgif-random]")?.addEventListener("click", () => choose(root, state));
      q(root, "[data-btcgif-refresh]")?.addEventListener("click", () => refreshMarket(root, state));

      auto?.addEventListener("change", () => {
        safeSet(AUTO_KEY, auto.value);
        scheduleAuto(root, state);
      });

      choose(root, state);
      await refreshMarket(root, state);
      scheduleAuto(root, state);
      animationLoop(root, state);

      async function marketLoop() {
        if (!root.isConnected) return;
        await refreshMarket(root, state);
        state.marketTimer = W.setTimeout(marketLoop, 15000);
      }

      state.marketTimer = W.setTimeout(marketLoop, 15000);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-btcgif-market]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
