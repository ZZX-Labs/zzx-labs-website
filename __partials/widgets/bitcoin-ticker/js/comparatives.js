// __partials/widgets/bitcoin-ticker/js/comparatives.js
// Commodity equivalents + U.S. federal debt absorption for Bitcoin Ticker.
// Loaded only by ../widget.js. No external library dependencies.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.ZZXBitcoinTickerComparatives && W.ZZXBitcoinTickerComparatives.__version >= 1) return;

  const MARKET_TTL_MS = 5 * 60 * 1000;
  const DEBT_TTL_MS = 30 * 60 * 1000;
  const CANNABIS_KEY = "zzx.widget.bitcoin-ticker.cannabis-usd-lb";

  const ENDPOINTS = {
    localCommodities: "/bitcoin/bpi/api/commodities.json",
    localDebt: "/bitcoin/bpi/api/us_debt.json",
    treasuryDebt: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1",
    goldprice: "https://data-asg.goldprice.org/dbXRates/USD",
    metalsLive: "https://api.metals.live/v1/spot",
    mempoolTip: "https://mempool.space/api/blocks/tip/height",
    stooq: {
      gold: "https://stooq.com/q/l/?s=gc.f&i=d",
      silver: "https://stooq.com/q/l/?s=si.f&i=d",
      platinum: "https://stooq.com/q/l/?s=pl.f&i=d",
      palladium: "https://stooq.com/q/l/?s=pa.f&i=d",
      copper: "https://stooq.com/q/l/?s=hg.f&i=d",
      oil: "https://stooq.com/q/l/?s=cl.f&i=d"
    }
  };

  const cache = {
    markets: null,
    marketsAt: 0,
    debt: null,
    debtAt: 0,
    lastContext: null
  };

  function api() {
    return W.ZZXAPI || null;
  }

  function localURL(path) {
    const A = api();
    return A && typeof A.url === "function" ? A.url(path) : path;
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function positive(value) {
    const n = number(value);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }

  function firstPositive() {
    for (const value of arguments) {
      const n = positive(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function safeGet(key) {
    try { return W.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { W.localStorage.setItem(key, String(value)); }
    catch (_) {}
  }

  function setText(root, selector, value) {
    const element = root && root.querySelector(selector);
    if (!element) return;
    element.textContent = value == null ? "—" : String(value);
  }

  function setTitle(root, selector, value) {
    const element = root && root.querySelector(selector);
    if (!element) return;
    if (value) element.setAttribute("title", String(value));
    else element.removeAttribute("title");
  }

  async function fetchResponse(path, options) {
    const opts = Object.assign({ timeoutMs: 9000, retries: 1, retryDelayMs: 350 }, options || {});
    const A = api();

    if (A && typeof A.fetchRaw === "function") {
      return await A.fetchRaw(path, opts);
    }

    const resolved = /^https?:\/\//i.test(path) ? path : localURL(path);
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? W.setTimeout(function () { controller.abort(); }, opts.timeoutMs || 9000) : null;

    try {
      const response = await fetch(resolved, {
        cache: "no-store",
        credentials: /^https?:\/\//i.test(resolved) ? "omit" : "same-origin",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("HTTP " + response.status + " " + resolved);
      return response;
    } finally {
      if (timer !== null) W.clearTimeout(timer);
    }
  }

  async function fetchJSON(path, fallback) {
    try {
      const response = await fetchResponse(path);
      return await response.json();
    } catch (error) {
      if (arguments.length > 1) return fallback;
      throw error;
    }
  }

  async function fetchText(path, fallback) {
    try {
      const response = await fetchResponse(path);
      return await response.text();
    } catch (error) {
      if (arguments.length > 1) return fallback;
      throw error;
    }
  }

  function normalizeLocalCommodities(data) {
    if (!data || typeof data !== "object") return null;

    const prices = data.prices || data.commodities || data;
    const normalized = {
      gold: firstPositive(prices.gold_usd_oz, prices.gold, prices.xau_usd_oz, prices.XAU),
      silver: firstPositive(prices.silver_usd_oz, prices.silver, prices.xag_usd_oz, prices.XAG),
      platinum: firstPositive(prices.platinum_usd_oz, prices.platinum, prices.xpt_usd_oz, prices.XPT),
      palladium: firstPositive(prices.palladium_usd_oz, prices.palladium, prices.xpd_usd_oz, prices.XPD),
      copper: firstPositive(prices.copper_usd_lb, prices.copper, prices.hg_usd_lb),
      oil: firstPositive(prices.oil_usd_barrel, prices.crude_usd_barrel, prices.wti_usd_barrel, prices.oil),
      cannabis: firstPositive(prices.cannabis_usd_lb, prices.cannabis),
      updatedAt: data.updated_at || data.updatedAt || null,
      sources: data.sources || null,
      provider: data.provider || data.source || "ZZX local commodities"
    };

    return normalized;
  }

  function mergePrices(target, incoming, providerLabel) {
    if (!incoming) return;
    for (const key of ["gold", "silver", "platinum", "palladium", "copper", "oil", "cannabis"]) {
      if (!Number.isFinite(positive(target[key])) && Number.isFinite(positive(incoming[key]))) {
        target[key] = Number(incoming[key]);
        target.priceSources[key] = incoming.priceSources && incoming.priceSources[key]
          ? incoming.priceSources[key]
          : providerLabel;
      }
    }

    if (!target.updatedAt && incoming.updatedAt) target.updatedAt = incoming.updatedAt;
  }

  function parseGoldPrice(data) {
    const item = data && Array.isArray(data.items) ? data.items[0] : null;
    if (!item) return null;
    return {
      gold: firstPositive(item.xauPrice, item.goldPrice),
      silver: firstPositive(item.xagPrice, item.silverPrice),
      updatedAt: data.ts ? new Date(Number(data.ts) < 1000000000000 ? Number(data.ts) * 1000 : Number(data.ts)).toISOString() : null,
      priceSources: { gold: "GoldPrice", silver: "GoldPrice" }
    };
  }

  function parseMetalsLive(data) {
    if (!Array.isArray(data)) return null;
    const out = { priceSources: {} };

    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      for (const [rawKey, rawValue] of Object.entries(row)) {
        const key = String(rawKey).toLowerCase();
        const value = positive(rawValue);
        if (!Number.isFinite(value)) continue;

        if (key.includes("gold")) { out.gold = value; out.priceSources.gold = "metals.live"; }
        else if (key.includes("silver")) { out.silver = value; out.priceSources.silver = "metals.live"; }
        else if (key.includes("platinum")) { out.platinum = value; out.priceSources.platinum = "metals.live"; }
        else if (key.includes("palladium")) { out.palladium = value; out.priceSources.palladium = "metals.live"; }
      }
    }

    return out;
  }

  function parseStooqClose(text) {
    const rows = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (!rows.length) return NaN;

    const last = rows[rows.length - 1].split(",");
    if (last.length >= 7 && String(last[0]).toLowerCase() !== "symbol") {
      return positive(last[6]);
    }

    if (rows.length >= 2) {
      const header = rows[0].split(",").map(function (x) { return x.trim().toLowerCase(); });
      const values = rows[1].split(",");
      const closeIndex = header.indexOf("close");
      if (closeIndex >= 0) return positive(values[closeIndex]);
    }

    return NaN;
  }

  async function loadMarkets(force) {
    const now = Date.now();
    if (!force && cache.markets && now - cache.marketsAt < MARKET_TTL_MS) return cache.markets;

    const result = {
      gold: NaN,
      silver: NaN,
      platinum: NaN,
      palladium: NaN,
      copper: NaN,
      oil: NaN,
      cannabis: NaN,
      updatedAt: null,
      priceSources: {}
    };

    const local = normalizeLocalCommodities(await fetchJSON(ENDPOINTS.localCommodities, null));
    if (local) {
      mergePrices(result, Object.assign({}, local, {
        priceSources: {
          gold: local.provider,
          silver: local.provider,
          platinum: local.provider,
          palladium: local.provider,
          copper: local.provider,
          oil: local.provider,
          cannabis: local.provider
        }
      }), local.provider);
    }

    if (!Number.isFinite(positive(result.gold)) || !Number.isFinite(positive(result.silver))) {
      mergePrices(result, parseGoldPrice(await fetchJSON(ENDPOINTS.goldprice, null)), "GoldPrice");
    }

    if (
      !Number.isFinite(positive(result.platinum)) ||
      !Number.isFinite(positive(result.palladium))
    ) {
      mergePrices(result, parseMetalsLive(await fetchJSON(ENDPOINTS.metalsLive, null)), "metals.live");
    }

    const stooqNeeds = ["gold", "silver", "platinum", "palladium", "copper", "oil"].filter(function (key) {
      return !Number.isFinite(positive(result[key]));
    });

    await Promise.all(stooqNeeds.map(async function (key) {
      const text = await fetchText(ENDPOINTS.stooq[key], "");
      const close = parseStooqClose(text);
      if (Number.isFinite(close)) {
        result[key] = close;
        result.priceSources[key] = "Stooq " + ENDPOINTS.stooq[key].match(/s=([^&]+)/i)[1].toUpperCase();
      }
    }));

    const localCannabis = positive(safeGet(CANNABIS_KEY));
    if (Number.isFinite(localCannabis)) {
      result.cannabis = localCannabis;
      result.priceSources.cannabis = "local reference";
    }

    cache.markets = result;
    cache.marketsAt = now;
    return result;
  }

  function normalizeDebt(data) {
    if (!data || typeof data !== "object") return null;

    const direct = firstPositive(
      data.total_public_debt_outstanding,
      data.total_debt,
      data.debt_usd,
      data.value,
      data.amount
    );

    if (Number.isFinite(direct)) {
      return {
        amount: direct,
        updatedAt: data.record_date || data.updated_at || data.updatedAt || null,
        source: data.source || data.provider || "ZZX local debt"
      };
    }

    const row = Array.isArray(data.data) ? data.data[0] : null;
    if (row) {
      const amount = firstPositive(
        row.tot_pub_debt_out_amt,
        row.total_public_debt_outstanding,
        row.total_debt
      );

      if (Number.isFinite(amount)) {
        return {
          amount: amount,
          updatedAt: row.record_date || null,
          source: "U.S. Treasury Fiscal Data"
        };
      }
    }

    return null;
  }

  async function loadDebt(force) {
    const now = Date.now();
    if (!force && cache.debt && now - cache.debtAt < DEBT_TTL_MS) return cache.debt;

    let debt = normalizeDebt(await fetchJSON(ENDPOINTS.localDebt, null));
    if (!debt) debt = normalizeDebt(await fetchJSON(ENDPOINTS.treasuryDebt, null));

    cache.debt = debt;
    cache.debtAt = now;
    return debt;
  }

  function heightFromLatest(latest) {
    return Math.floor(firstPositive(
      latest && latest.block_height,
      latest && latest.tip_height,
      latest && latest.height,
      latest && latest.chain && latest.chain.height
    ));
  }

  async function currentHeight(latest) {
    const fromLatest = heightFromLatest(latest);
    if (Number.isFinite(fromLatest) && fromLatest >= 0) return fromLatest;

    const text = await fetchText(ENDPOINTS.mempoolTip, "");
    const n = Math.floor(number(String(text).trim()));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  }

  function scheduledIssuedSats(height) {
    const tip = Math.floor(number(height));
    if (!Number.isFinite(tip) || tip < 0) return NaN;

    let total = 0;
    let startHeight = 0;
    let subsidy = 50 * 100000000;

    while (startHeight <= tip && subsidy > 0) {
      const endHeight = Math.min(tip, startHeight + 209999);
      const blocks = endHeight - startHeight + 1;
      total += blocks * subsidy;
      startHeight = endHeight + 1;
      subsidy = Math.floor(subsidy / 2);
    }

    return total;
  }

  function formatQuantity(value) {
    const n = number(value);
    if (!Number.isFinite(n)) return "—";

    const abs = Math.abs(n);
    let digits = 2;
    if (abs >= 1000000) digits = 0;
    else if (abs >= 1000) digits = 1;
    else if (abs < 1) digits = 4;

    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function formatUSD(value, negative) {
    const n = number(value);
    if (!Number.isFinite(n)) return "—";

    const amount = negative ? -Math.abs(n) : n;
    try {
      return amount.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      });
    } catch (_) {
      return (amount < 0 ? "-$" : "$") + Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
  }

  function formatCompactUSD(value) {
    const n = number(value);
    if (!Number.isFinite(n)) return "—";
    try {
      return n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2
      });
    } catch (_) {
      return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
  }

  function formatAge(timestamp) {
    if (!timestamp) return "";
    const then = new Date(timestamp).getTime();
    if (!Number.isFinite(then)) return "";
    const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (sec < 60) return sec + "s ago";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 48) return hr + "h ago";
    return Math.floor(hr / 24) + "d ago";
  }

  function sourceSummary(markets) {
    const sources = new Set();
    Object.values(markets.priceSources || {}).forEach(function (value) {
      if (value) sources.add(value);
    });
    if (!sources.size) return "commodity references unavailable";
    return Array.from(sources).join(" · ");
  }

  function renderCommodity(root, key, btcUsd, markets) {
    const price = positive(markets[key]);
    const quantity = Number.isFinite(price) ? btcUsd / price : NaN;
    setText(root, "[data-comp-" + key + "]", formatQuantity(quantity));

    const source = markets.priceSources && markets.priceSources[key];
    const unit = key === "copper" || key === "cannabis" ? "lb" : key === "oil" ? "barrel" : "troy oz";
    setTitle(
      root,
      '[data-comparative="' + key + '"]',
      Number.isFinite(price)
        ? key + " reference: $" + price.toLocaleString(undefined, { maximumFractionDigits: 4 }) + "/" + unit + (source ? " · " + source : "")
        : key + " reference unavailable"
    );
  }

  function mount(root) {
    if (!root || root.__zzxComparativesBound) return;
    root.__zzxComparativesBound = true;

    const input = root.querySelector("[data-cannabis-usd-lb]");
    if (input) {
      const stored = positive(safeGet(CANNABIS_KEY));
      if (Number.isFinite(stored)) input.value = String(stored);

      input.addEventListener("change", function () {
        const value = positive(input.value);
        if (Number.isFinite(value)) safeSet(CANNABIS_KEY, value);
        else {
          try { W.localStorage.removeItem(CANNABIS_KEY); } catch (_) {}
        }
        cache.marketsAt = 0;
        if (cache.lastContext) update(root, cache.lastContext);
      });
    }
  }

  async function update(root, context) {
    if (!root || !context) return;
    mount(root);
    cache.lastContext = context;

    const btcUsd = positive(context.btcUsd);
    if (!Number.isFinite(btcUsd)) return;

    setText(root, "[data-comparatives-state]", "refreshing references");

    const [markets, debt, height] = await Promise.all([
      loadMarkets(false),
      loadDebt(false),
      currentHeight(context.latest || null)
    ]);

    for (const key of ["gold", "silver", "platinum", "palladium", "copper", "oil", "cannabis"]) {
      renderCommodity(root, key, btcUsd, markets);
    }

    const available = ["gold", "silver", "platinum", "palladium", "copper", "oil", "cannabis"].filter(function (key) {
      return Number.isFinite(positive(markets[key]));
    }).length;

    setText(root, "[data-comparatives-state]", available + "/7 references");
    setText(root, "[data-commodity-source]", sourceSummary(markets));
    setText(root, "[data-commodity-updated]", markets.updatedAt ? "updated " + formatAge(markets.updatedAt) : "live/browser references");

    if (debt && Number.isFinite(positive(debt.amount))) {
      setText(root, "[data-us-debt-total]", formatCompactUSD(debt.amount));
      setText(root, "[data-debt-source]", debt.source + (debt.updatedAt ? " · " + debt.updatedAt : ""));

      const sats = scheduledIssuedSats(height);
      const issuedBtc = Number.isFinite(sats) ? sats / 100000000 : NaN;
      const perIssued = Number.isFinite(issuedBtc) && issuedBtc > 0 ? debt.amount / issuedBtc : NaN;
      const perTerminal = debt.amount / 21000000;

      setText(root, "[data-debt-per-issued]", formatUSD(perIssued, true));
      setText(root, "[data-debt-per-terminal]", formatUSD(perTerminal, true));
      setText(
        root,
        "[data-issued-supply]",
        Number.isFinite(issuedBtc)
          ? "scheduled supply " + issuedBtc.toLocaleString(undefined, { maximumFractionDigits: 8 }) + " BTC"
          : "scheduled supply unavailable"
      );
    } else {
      setText(root, "[data-us-debt-total]", "—");
      setText(root, "[data-debt-per-issued]", "—");
      setText(root, "[data-debt-per-terminal]", "—");
      setText(root, "[data-issued-supply]", "scheduled supply unavailable");
      setText(root, "[data-debt-source]", "U.S. debt data unavailable");
    }

    setText(root, "[data-chain-height]", Number.isFinite(height) ? "height " + height.toLocaleString() : "height unavailable");
  }

  W.ZZXBitcoinTickerComparatives = {
    __version: 1,
    mount: mount,
    update: update,
    scheduledIssuedSats: scheduledIssuedSats,
    loadMarkets: loadMarkets,
    loadDebt: loadDebt
  };
})();
