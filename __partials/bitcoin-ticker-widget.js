// __partials/bitcoin-ticker-widget.js
// DROP-IN replacement (multi-widget updater + sparklines + mempool + intel)
// Safe if fragment is missing or re-injected. Designed to run once per page.

(function () {
  // -----------------------------
  // helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  function mounted() {
    // fragment present if primary span exists
    return !!byId("btc-value");
  }

  function setCard(id, valueText, subText) {
    const card = byId(id);
    if (!card) return;
    const v = $('[data-val]', card);
    const s = $('[data-sub]', card);
    if (v) v.textContent = (valueText ?? '—');
    if (s && subText != null) s.textContent = subText;
  }

  async function jget(url, opts) {
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }

  async function tget(url, opts) {
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtBig(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(2) + "K";
    return sign + abs.toFixed(2);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // -----------------------------
  // SVG sparkline (expects your CSS)
  // - Uses existing <svg.btc-spark> if present in card.
  // - If not present, injects it immediately after the value row (stable).
  // -----------------------------
  function ensureSpark(cardId) {
    const card = byId(cardId);
    if (!card) return null;

    let svg = $(".btc-spark", card);
    if (svg) return svg;

    // Insert after value line if possible, else after title
    const after = $(".btc-card__value", card) || $(".btc-card__title", card) || card.firstChild;

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("btc-spark");
    svg.setAttribute("viewBox", "0 0 240 38");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    svg.innerHTML = `
      <path class="grid" d="M0 19 H240"></path>
      <path class="fill" d=""></path>
      <path class="line" d=""></path>
    `;

    // stable insertion
    if (after && after.parentNode) {
      after.insertAdjacentElement("afterend", svg);
    } else {
      card.appendChild(svg);
    }
    return svg;
  }

  function drawSpark(cardId, series) {
    const svg = ensureSpark(cardId);
    if (!svg) return;

    const nums = (Array.isArray(series) ? series : [])
      .map(Number)
      .filter(Number.isFinite);

    const linePath = svg.querySelector("path.line");
    const fillPath = svg.querySelector("path.fill");
    if (!linePath || !fillPath) return;

    if (nums.length < 2) {
      linePath.setAttribute("d", "");
      fillPath.setAttribute("d", "");
      return;
    }

    const W = 240, H = 38, pad = 3;

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = (max - min) || 1;

    const step = W / (nums.length - 1);

    const pts = nums.map((v, i) => {
      const x = i * step;
      const t = (v - min) / span;
      const y = (H - pad) - t * (H - pad * 2);
      return { x, y };
    });

    const dLine = "M " + pts.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");
    const dFill = dLine + ` L ${W} ${H} L 0 ${H} Z`;

    linePath.setAttribute("d", dLine);
    fillPath.setAttribute("d", dFill);
  }

  // -----------------------------
  // 1) Primary spot ticker (Coinbase)
  // -----------------------------
  const SPOT = "https://api.coinbase.com/v2/prices/spot?currency=USD";

  async function updateSpot() {
    if (!mounted()) return;
    try {
      const data = await jget(SPOT);
      const btcPrice = parseFloat(data?.data?.amount);
      if (!Number.isFinite(btcPrice)) return;

      const mbtc = btcPrice * 0.001;
      const ubtc = btcPrice * 0.000001;
      const sat  = btcPrice * 0.00000001;

      const a = byId("btc-value");
      const b = byId("mbtc-value");
      const c = byId("ubtc-value");
      const d = byId("sats-value");
      if (!a || !b || !c || !d) return;

      a.textContent = btcPrice.toFixed(2);
      b.textContent = mbtc.toFixed(2);
      c.textContent = ubtc.toFixed(4);
      d.textContent = sat.toFixed(6);
    } catch (_) {}
  }

  // -----------------------------
  // 2) 24h price + volume (Coinbase Exchange)
  // - We use 15m candles for better graph resolution.
  // - Card markup already includes "$<span data-val>" for price.
  //   So we set the span to numeric only (no extra $).
  // -----------------------------
  const CANDLES_15M = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

  async function update24hGraphs() {
    if (!mounted()) return;

    try {
      const candles = await jget(CANDLES_15M);
      if (!Array.isArray(candles) || candles.length < 2) return;

      // newest-first -> oldest-first
      const rows = candles.slice().reverse();

      // last 24h in 15m buckets = 96 points
      const last96 = rows.slice(-96);

      // [time, low, high, open, close, volume]
      const closes = last96.map(r => Number(r?.[4])).filter(Number.isFinite);
      const volsBtc = last96.map(r => Number(r?.[5])).filter(Number.isFinite);

      if (closes.length >= 2) {
        const first = closes[0];
        const last = closes[closes.length - 1];
        const changePct = (Number.isFinite(first) && first !== 0 && Number.isFinite(last))
          ? ((last - first) / first) * 100
          : NaN;

        // IMPORTANT: span already has $ in HTML for this card
        setCard("btc-24hprice", fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
        drawSpark("btc-24hprice", closes);
      }

      // Approx volume USD using close per candle; also compute total
      let totalUsd = 0;
      const volsUsd = last96.map(r => {
        const vbtc = Number(r?.[5]);
        const close = Number(r?.[4]);
        const v = (Number.isFinite(vbtc) && Number.isFinite(close)) ? (vbtc * close) : NaN;
        if (Number.isFinite(v)) totalUsd += v;
        return v;
      }).filter(Number.isFinite);

      // This card does NOT have a leading "$" in HTML
      setCard("btc-24hvolume", `$${fmtBig(totalUsd)}`, "USD");
      drawSpark("btc-24hvolume", volsUsd.length ? volsUsd : volsBtc);
    } catch (_) {
      // leave prior values; avoid flicker
    }
  }

  // -----------------------------
  // 3) mempool.space stats
  // - endpoints vary; we probe common ones and degrade cleanly.
  // -----------------------------
  const MEMPOOL = "https://mempool.space/api";

  async function tryJson(urls) {
    for (const u of urls) {
      try { return await jget(u); } catch (_) {}
    }
    throw new Error("all endpoints failed");
  }

  async function updateFees() {
    if (!mounted()) return;
    try {
      const f = await jget(`${MEMPOOL}/v1/fees/recommended`);
      const fast = Number(f?.fastestFee);
      const mid  = Number(f?.halfHourFee);
      const slow = Number(f?.hourFee);

      const txt = (Number.isFinite(fast) && Number.isFinite(mid) && Number.isFinite(slow))
        ? `H:${fast}  M:${mid}  L:${slow}`
        : "—";
      setCard("btc-fees", txt, "sat/vB");
    } catch (_) {
      setCard("btc-fees", "—", "sat/vB");
    }
  }

  async function updateMempool() {
    if (!mounted()) return;
    try {
      const m = await jget(`${MEMPOOL}/mempool`);
      const count = Number(m?.count);
      setCard("btc-mempool", Number.isFinite(count) ? fmtBig(count) : "—", "tx");
    } catch (_) {
      setCard("btc-mempool", "—", "tx");
    }
  }

  async function updateTipAndDrift() {
    if (!mounted()) return;
    try {
      const heightText = await tget(`${MEMPOOL}/blocks/tip/height`);
      const h = parseInt(String(heightText).trim(), 10);
      setCard("btc-tip", Number.isFinite(h) ? String(h) : "—", "height");

      // /blocks/tip returns a block object with timestamp (seconds)
      const tip = await jget(`${MEMPOOL}/blocks/tip`);
      const ts = Number(tip?.timestamp);
      if (Number.isFinite(ts)) {
        const driftSec = Math.round((Date.now() - ts * 1000) / 1000);
        const sign = driftSec >= 0 ? "+" : "-";
        const mins = Math.abs(driftSec) / 60;
        setCard("btc-clockdrift", `${sign}${mins.toFixed(1)}m`, "vs tip");
      } else {
        setCard("btc-clockdrift", "—", "vs tip");
      }
    } catch (_) {
      setCard("btc-tip", "—", "height");
      setCard("btc-clockdrift", "—", "vs tip");
    }
  }

  async function updateHashrate() {
    if (!mounted()) return;

    // Known mempool variants seen in the wild:
    // - /v1/mining/hashrate/3d -> [{timestamp, hashrate}]
    // - /v1/mining/hashrate -> {currentHashrate, ...}
    // - /v1/mining/hashrate/1y, /7d etc.
    const candidates = [
      `${MEMPOOL}/v1/mining/hashrate/3d`,
      `${MEMPOOL}/v1/mining/hashrate/7d`,
      `${MEMPOOL}/v1/mining/hashrate`,
    ];

    try {
      const data = await tryJson(candidates);

      let seriesEH = [];

      if (Array.isArray(data)) {
        // [{timestamp, hashrate}] where hashrate is H/s
        seriesEH = data
          .map(x => Number(x?.hashrate))
          .filter(Number.isFinite)
          .map(hs => hs / 1e18);
      } else if (data && typeof data === "object") {
        // {currentHashrate: ...} or {hashrate: ...}
        const cur = Number(data?.currentHashrate ?? data?.hashrate ?? data?.value);
        if (Number.isFinite(cur)) seriesEH = [cur / 1e18];
      }

      const lastEH = seriesEH.length ? seriesEH[seriesEH.length - 1] : NaN;

      setCard("btc-hashrate", Number.isFinite(lastEH) ? lastEH.toFixed(2) : "—", "EH/s");
      if (seriesEH.length >= 2) drawSpark("btc-hashrate", seriesEH.slice(-96));
    } catch (_) {
      setCard("btc-hashrate", "—", "EH/s");
    }
  }

  async function updateLN() {
    if (!mounted()) return;

    // mempool LN endpoints vary; try a few
    const candidates = [
      `${MEMPOOL}/v1/lightning/statistics`,
      `${MEMPOOL}/v1/lightning`,
      `${MEMPOOL}/v1/lightning/nodes`, // sometimes exists
    ];

    try {
      const ln = await tryJson(candidates);

      // Most useful display: capacity BTC (if provided), else nodes
      const cap = Number(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity ?? ln?.network_capacity);
      const nodes = Number(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);

      if (Number.isFinite(cap)) {
        setCard("btc-lnstats", fmtBig(cap), "BTC cap");
      } else if (Number.isFinite(nodes)) {
        setCard("btc-lnstats", fmtBig(nodes), "LN nodes");
      } else {
        setCard("btc-lnstats", "—", "capacity");
      }
    } catch (_) {
      setCard("btc-lnstats", "—", "capacity");
    }
  }

  // -----------------------------
  // 4) Intel feeds: GitHub commits + HN
  // - GitHub unauthenticated rate limits hard.
  //   We:
  //   - fetch fewer repos per cycle
  //   - cache for 60s
  // -----------------------------
  const GH = "https://api.github.com";
  const INTEL_REPOS = [
    "bitcoin/bitcoin",
    "bitcoin/bips",
    "lightning/bolts",
    "lightningnetwork/lnd",
  ];

  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story";

  function renderIntel(items) {
    const hostId = "btc-intel";
    const box = byId(hostId);
    if (!box) return;
    const list = $(".btc-news__list", box);
    if (!list) return;

    list.innerHTML = "";

    items.slice(0, 8).forEach(it => {
      const row = document.createElement("div");
      row.className = "btc-news__item";

      const src = document.createElement("span");
      src.className = "btc-news__src";
      src.textContent = it.source || "src";

      const a = document.createElement("a");
      a.href = it.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = it.title || "—";

      row.appendChild(src);
      row.appendChild(a);
      list.appendChild(row);
    });

    if (!items.length) {
      const row = document.createElement("div");
      row.className = "btc-news__item";
      row.innerHTML = `<span class="btc-news__src">intel</span><a href="#" tabindex="-1">no items</a>`;
      list.appendChild(row);
    }
  }

  const __intelCache = { ts: 0, items: [] };

  async function ghLatestCommit(repo) {
    const url = `${GH}/repos/${repo}/commits?per_page=1`;
    const arr = await jget(url, { headers: { "Accept": "application/vnd.github+json" } });
    const c = Array.isArray(arr) ? arr[0] : null;
    const msg = String(c?.commit?.message || "").split("\n")[0].slice(0, 90);
    return {
      source: "GH",
      title: `${repo.split("/")[1]}: ${msg || "update"}`,
      url: c?.html_url || `https://github.com/${repo}`,
      ts: c?.commit?.author?.date ? Date.parse(c.commit.author.date) : 0,
    };
  }

  async function updateIntel() {
    if (!mounted()) return;

    // 60s cache to reduce GH limit pain
    const now = Date.now();
    if (__intelCache.items.length && (now - __intelCache.ts) < 60_000) {
      renderIntel(__intelCache.items);
      return;
    }

    const items = [];

    // GitHub: fetch 2 repos per run, round-robin
    try {
      const idx = Math.floor(now / 60_000) % INTEL_REPOS.length;
      const batch = [INTEL_REPOS[idx], INTEL_REPOS[(idx + 1) % INTEL_REPOS.length]];
      for (const repo of batch) items.push(await ghLatestCommit(repo));
    } catch (_) {
      // ignore; still show HN
    }

    // Hacker News
    try {
      const data = await jget(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const hn = hits.slice(0, 4).map(h => ({
        source: "HN",
        title: h.title || h.story_title || "—",
        url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        ts: h.created_at_i ? (h.created_at_i * 1000) : 0
      }));
      items.push(...hn);
    } catch (_) {}

    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    __intelCache.ts = now;
    __intelCache.items = items;

    renderIntel(items);
  }

  // -----------------------------
  // 5) Keep nodecount as placeholder for now
  // (You requested bitnodes next; we’ll do it in the next pass once you confirm CORS/proxy.)
  // -----------------------------
  async function updateNodecount() {
    if (!mounted()) return;
    setCard("btc-nodecount", "—", "reachable");
  }

  // -----------------------------
  // scheduling (DON’T fight the page)
  // -----------------------------
  let started = false;

  function start() {
    if (started) return;
    started = true;

    // Prime
    updateSpot();
    update24hGraphs();

    updateHashrate();
    updateLN();
    updateFees();
    updateMempool();
    updateTipAndDrift();
    updateNodecount();

    updateIntel();

    // Timers
    setInterval(updateSpot, 250);

    // Graphs shouldn’t hammer; candles are heavier
    setInterval(update24hGraphs, 60_000);

    // mempool bundle
    setInterval(() => {
      updateHashrate();
      updateLN();
      updateFees();
      updateMempool();
      updateTipAndDrift();
      updateNodecount();
    }, 15_000);

    // intel slower
    setInterval(updateIntel, 60_000);
  }

  start();
})();
