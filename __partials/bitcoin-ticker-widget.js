// __partials/bitcoin-ticker-widget.js
// DROP-IN (restores Satoshi quote + adds Bitnodes via AllOrigins + LN via mempool + goggles iframe + better drift)
// Safe if fragment missing or re-injected.

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  function mounted() { return !!byId("btc-value"); }

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

  // -------- AllOrigins helper (raw mode) --------
  // This is how we bypass CORS for sources that block browsers (bitnodes, etc.)
  async function jgetAllOrigins(targetUrl) {
    const ao = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const r = await fetch(ao, { cache: "no-store" });
    if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
    return await r.json();
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

  // -------- Sparkline (optional; only if your CSS includes btc-spark rules) --------
  function ensureSpark(cardId) {
    const card = byId(cardId);
    if (!card) return null;
    let svg = $(".btc-spark", card);
    if (svg) return svg;

    const after = $(".btc-card__value", card) || $(".btc-card__title", card);
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("btc-spark");
    svg.setAttribute("viewBox", "0 0 240 38");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = `
      <path class="grid" d="M0 19 H240"></path>
      <path class="fill" d=""></path>
      <path class="line" d=""></path>
    `;
    if (after) after.insertAdjacentElement("afterend", svg);
    else card.appendChild(svg);
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

  // ============================================================
  // 1) Spot ticker (Coinbase)
  // ============================================================
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

  // ============================================================
  // 2) 24h price + volume with sparklines (Coinbase Exchange candles)
  // ============================================================
  const CANDLES_15M = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

  async function update24hGraphs() {
    if (!mounted()) return;
    try {
      const candles = await jget(CANDLES_15M);
      if (!Array.isArray(candles) || candles.length < 2) return;

      const rows = candles.slice().reverse();
      const last96 = rows.slice(-96); // 24h @ 15m

      const closes = last96.map(r => Number(r?.[4])).filter(Number.isFinite);
      if (closes.length >= 2) {
        const first = closes[0];
        const last = closes[closes.length - 1];
        const changePct = (Number.isFinite(first) && first !== 0)
          ? ((last - first) / first) * 100
          : NaN;

        // Card already prints "$" in HTML, so value is numeric string only
        setCard("btc-24hprice", fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
        drawSpark("btc-24hprice", closes);
      }

      // Volume USD
      let totalUsd = 0;
      const volsUsd = last96.map(r => {
        const vbtc = Number(r?.[5]);
        const close = Number(r?.[4]);
        const v = (Number.isFinite(vbtc) && Number.isFinite(close)) ? (vbtc * close) : NaN;
        if (Number.isFinite(v)) totalUsd += v;
        return v;
      }).filter(Number.isFinite);

      // This card does NOT have "$" in its HTML
      setCard("btc-24hvolume", `$${fmtBig(totalUsd)}`, "USD");
      drawSpark("btc-24hvolume", volsUsd);
    } catch (_) {}
  }

  // ============================================================
  // 3) mempool.space stats (fees, mempool count, tip, drift, LN, hashrate)
  // ============================================================
  const MEMPOOL = "https://mempool.space/api";

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

  // Better drift:
  // - show: time since last block
  // - and in sub: avg interval (last 6 blocks) + delta vs 10m
  async function updateTipAndDrift() {
    if (!mounted()) return;
    try {
      const heightText = await tget(`${MEMPOOL}/blocks/tip/height`);
      const h = parseInt(String(heightText).trim(), 10);
      setCard("btc-tip", Number.isFinite(h) ? String(h) : "—", "height");

      // Recent blocks list includes timestamps
      const blocks = await jget(`${MEMPOOL}/blocks`);
      const arr = Array.isArray(blocks) ? blocks : [];
      const tip = arr[0];
      const tsTip = Number(tip?.timestamp);

      // time since last block
      if (Number.isFinite(tsTip)) {
        const sinceSec = Math.max(0, Math.round(Date.now()/1000 - tsTip));
        const sinceMin = (sinceSec / 60);

        // avg interval for last N blocks
        const N = 6;
        const ts = arr.slice(0, N).map(b => Number(b?.timestamp)).filter(Number.isFinite);
        let avgMin = NaN;
        if (ts.length >= 2) {
          const diffs = [];
          for (let i = 0; i < ts.length - 1; i++) diffs.push(ts[i] - ts[i+1]);
          const avgSec = diffs.reduce((a, x) => a + x, 0) / diffs.length;
          avgMin = avgSec / 60;
        }

        const delta10 = Number.isFinite(avgMin) ? (avgMin - 10) : NaN;
        const sub = Number.isFinite(avgMin)
          ? `avg:${avgMin.toFixed(1)}m  Δ10:${delta10 >= 0 ? "+" : ""}${delta10.toFixed(1)}m`
          : `avg:—`;

        setCard("btc-clockdrift", `+${sinceMin.toFixed(1)}m`, sub);
      } else {
        setCard("btc-clockdrift", "—", "vs last block");
      }
    } catch (_) {
      setCard("btc-tip", "—", "height");
      setCard("btc-clockdrift", "—", "vs last block");
    }
  }

  async function updateHashrate() {
    if (!mounted()) return;
    // endpoint naming varies across mempool deployments; we try a few.
    const candidates = [
      `${MEMPOOL}/v1/mining/hashrate/3d`,
      `${MEMPOOL}/v1/mining/hashrate/7d`,
      `${MEMPOOL}/v1/mining/hashrate`
    ];
    for (const u of candidates) {
      try {
        const data = await jget(u);
        let seriesEH = [];

        if (Array.isArray(data)) {
          seriesEH = data.map(x => Number(x?.hashrate)).filter(Number.isFinite).map(hs => hs / 1e18);
        } else if (data && typeof data === "object") {
          const cur = Number(data?.currentHashrate ?? data?.hashrate ?? data?.value);
          if (Number.isFinite(cur)) seriesEH = [cur / 1e18];
        }

        const lastEH = seriesEH.length ? seriesEH[seriesEH.length - 1] : NaN;
        setCard("btc-hashrate", Number.isFinite(lastEH) ? lastEH.toFixed(2) : "—", "EH/s");
        if (seriesEH.length >= 2) drawSpark("btc-hashrate", seriesEH.slice(-96));
        return;
      } catch (_) {}
    }
    setCard("btc-hashrate", "—", "EH/s");
  }

  async function updateLN() {
    if (!mounted()) return;

    // Mempool LN endpoints vary by instance; try a few.
    const candidates = [
      `${MEMPOOL}/v1/lightning/statistics`,
      `${MEMPOOL}/v1/lightning`,
      `${MEMPOOL}/v1/lightning/nodes`
    ];

    let ln = null;
    for (const u of candidates) {
      try { ln = await jget(u); break; } catch (_) {}
    }

    if (!ln || typeof ln !== "object") {
      setCard("btc-lnstats", "—", "capacity");
      const d = byId("btc-ln-detail");
      if (d) {
        const cap = d.querySelector("[data-cap]"); if (cap) cap.textContent = "—";
        const nodes = d.querySelector("[data-nodes]"); if (nodes) nodes.textContent = "—";
        const chans = d.querySelector("[data-chans]"); if (chans) chans.textContent = "—";
      }
      return;
    }

    const cap = Number(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity ?? ln?.network_capacity);
    const nodes = Number(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);
    const chans = Number(ln?.channels ?? ln?.channel_count ?? ln?.channelCount);

    // summary card
    if (Number.isFinite(cap)) setCard("btc-lnstats", fmtBig(cap), "BTC cap");
    else if (Number.isFinite(nodes)) setCard("btc-lnstats", fmtBig(nodes), "LN nodes");
    else setCard("btc-lnstats", "—", "capacity");

    // detail card
    const d = byId("btc-ln-detail");
    if (d) {
      const capEl = d.querySelector("[data-cap]");
      const nodesEl = d.querySelector("[data-nodes]");
      const chansEl = d.querySelector("[data-chans]");
      if (capEl) capEl.textContent = Number.isFinite(cap) ? `${fmtBig(cap)} BTC` : "—";
      if (nodesEl) nodesEl.textContent = Number.isFinite(nodes) ? fmtBig(nodes) : "—";
      if (chansEl) chansEl.textContent = Number.isFinite(chans) ? fmtBig(chans) : "—";
    }
  }

  // ============================================================
  // 4) Nodes via Bitnodes (CORS bypass via AllOrigins)
  // ============================================================
  // NOTE: I’m using the commonly-known Bitnodes snapshot endpoint.
  // If your preferred endpoint differs, swap BITNODES_* constants only.
  const BITNODES_LATEST = "https://bitnodes.io/api/v1/snapshots/latest/";

  function renderNations(topPairs, totals) {
    const card = byId("btc-nodes-nations");
    if (!card) return;

    const totalEl = card.querySelector("[data-total]");
    const reachEl = card.querySelector("[data-reachable]");
    const unreachEl = card.querySelector("[data-unreachable]");
    if (totalEl) totalEl.textContent = totals.total ?? "—";
    if (reachEl) reachEl.textContent = totals.reachable ?? "—";
    if (unreachEl) unreachEl.textContent = totals.unreachable ?? "—";

    const host = $(".btc-mini-list", card);
    if (!host) return;
    host.innerHTML = "";

    topPairs.slice(0, 8).forEach(([cc, n]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="cc">${cc}</span><span class="n">${n}</span>`;
      host.appendChild(row);
    });

    if (!topPairs.length) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="cc">—</span><span class="n">—</span>`;
      host.appendChild(row);
    }
  }

  async function updateNodes() {
    if (!mounted()) return;
    try {
      const data = await jgetAllOrigins(BITNODES_LATEST);

      // Bitnodes commonly returns keys like:
      // - total_nodes, latest_height
      // Some variants include:
      // - nodes (map), countries (map), etc.
      const total = Number(data?.total_nodes ?? data?.total ?? data?.count);
      const reachable = Number(data?.reachable_nodes ?? data?.reachable ?? data?.total_reachable);
      const unreachable = Number.isFinite(total) && Number.isFinite(reachable) ? (total - reachable) : Number(data?.unreachable ?? NaN);

      setCard("btc-nodecount",
        Number.isFinite(reachable) ? fmtBig(reachable) : (Number.isFinite(total) ? fmtBig(total) : "—"),
        "reachable"
      );

      // Country map if present; otherwise we just leave the list with totals.
      const countries = data?.countries ?? data?.country ?? null;

      let pairs = [];
      if (countries && typeof countries === "object") {
        pairs = Object.entries(countries)
          .map(([cc, n]) => [String(cc).toUpperCase(), Number(n)])
          .filter(([, n]) => Number.isFinite(n))
          .sort((a, b) => b[1] - a[1])
          .map(([cc, n]) => [cc, fmtBig(n)]);
      }

      renderNations(pairs, {
        total: Number.isFinite(total) ? fmtBig(total) : "—",
        reachable: Number.isFinite(reachable) ? fmtBig(reachable) : "—",
        unreachable: Number.isFinite(unreachable) ? fmtBig(unreachable) : "—"
      });
    } catch (_) {
      setCard("btc-nodecount", "—", "reachable");
      renderNations([], { total: "—", reachable: "—", unreachable: "—" });
    }
  }

  // ============================================================
  // 5) Intel feeds: GitHub commits + HN
  // ============================================================
  const GH = "https://api.github.com";
  const INTEL_REPOS = [
    "bitcoin/bitcoin",
    "bitcoin/bips",
    "lightning/bolts",
    "lightningnetwork/lnd",
  ];
  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story";

  function renderIntel(items) {
    const box = byId("btc-intel");
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
    const now = Date.now();

    // 60s cache to avoid GH throttling pain
    if (__intelCache.items.length && (now - __intelCache.ts) < 60_000) {
      renderIntel(__intelCache.items);
      return;
    }

    const items = [];

    // GitHub: 2 repos per minute, round-robin
    try {
      const idx = Math.floor(now / 60_000) % INTEL_REPOS.length;
      const batch = [INTEL_REPOS[idx], INTEL_REPOS[(idx + 1) % INTEL_REPOS.length]];
      for (const repo of batch) items.push(await ghLatestCommit(repo));
    } catch (_) {}

    // HN
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

  // ============================================================
  // 6) Satoshi Quote (local JSON preferred, fallback built-in)
  // ============================================================
  const QUOTES_FALLBACK = [
    {
      q: "The root problem with conventional currency is all the trust that's required to make it work.",
      src: "Satoshi (2009)",
      url: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source"
    },
    {
      q: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.",
      src: "Satoshi (2010)",
      url: "https://nakamotoinstitute.org/quotes/"
    },
    {
      q: "I'm sure that in 20 years there will either be very large transaction volume or no volume.",
      src: "Satoshi (2010)",
      url: "https://nakamotoinstitute.org/quotes/"
    },
    {
      q: "It might make sense just to get some in case it catches on.",
      src: "Satoshi (2009)",
      url: "https://nakamotoinstitute.org/quotes/"
    }
  ];
  const QUOTES_JSON = "/static/data/satoshi-quotes.json";

  async function loadQuotes() {
    try {
      const r = await fetch(QUOTES_JSON, { cache: "no-store" });
      if (!r.ok) throw new Error("no local quotes json");
      const data = await r.json();
      if (Array.isArray(data) && data.length) return data;
    } catch (_) {}
    return QUOTES_FALLBACK;
  }

  function renderQuote(item) {
    const card = byId("btc-satoshiquote");
    if (!card) return;
    const qt = card.querySelector("[data-quote]");
    const src = card.querySelector("[data-src]");
    const link = card.querySelector("[data-link]");
    if (qt) qt.textContent = `“${item?.q || "—"}”`;
    if (src) src.textContent = item?.src || "Satoshi";
    if (link) {
      link.href = item?.url || "https://nakamotoinstitute.org/quotes/";
      link.textContent = "source";
    }
  }

  let __quotes = null;
  let __qtTimer = null;

  async function startQuotes() {
    if (!mounted()) return;
    if (!byId("btc-satoshiquote")) return;

    if (!__quotes) __quotes = await loadQuotes();
    if (!Array.isArray(__quotes) || !__quotes.length) __quotes = QUOTES_FALLBACK;

    const pick = () => __quotes[Math.floor(Math.random() * __quotes.length)];
    renderQuote(pick());

    if (__qtTimer) return;
    __qtTimer = setInterval(() => {
      if (!byId("btc-satoshiquote")) { clearInterval(__qtTimer); __qtTimer = null; return; }
      renderQuote(pick());
    }, 45_000);
  }

// ===============================
// Mempool Goggles (client-only, stable)
// - NO iframe (blocked by mempool.space anti-framing headers)
// - Deterministic fill visuals (no flicker)
// - Uses fee_histogram -> “next block” approximation
// ===============================
(function () {
  const MEMPOOL = "https://mempool.space/api";

  function $(sel, root = document) { return root.querySelector(sel); }
  function byId(id) { return document.getElementById(id); }

  function mounted() {
    return !!byId("btc-goggles-canvas");
  }

  async function jget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }

  async function tget(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  function ensureThemeLoaded() {
    // Optional: if you have /static/js/theme.js
    if (window.ZZXTheme?.widgets?.mempoolGoggles) return Promise.resolve();
    if (document.querySelector('script[data-zzx-theme="1"]')) return Promise.resolve();

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "/static/js/theme.js";
      s.defer = true;
      s.dataset.zzxTheme = "1";
      s.onload = () => resolve();
      s.onerror = () => resolve(); // non-fatal
      document.head.appendChild(s);
    });
  }

  // -------- stable hash + seeded RNG --------
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // fee_histogram: [[feeRate, vsize], ...]
  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map(([fee, vsize]) => [Number(fee), Number(vsize)])
      .filter(([fee, vsize]) => Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0);

    // Highest fee first
    rows.sort((a, b) => b[0] - a[0]);

    let used = 0;
    const picked = [];
    for (const [fee, vsize] of rows) {
      if (used >= targetVSize) break;
      const take = Math.min(vsize, targetVSize - used);
      if (take <= 0) continue;
      picked.push({ fee, vsize: take });
      used += take;
    }
    return { picked, used, targetVSize };
  }

  function toTiers(picked, tierCount) {
    if (!picked.length) return [];
    const fees = picked.map(x => x.fee);
    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    const span = (maxFee - minFee) || 1;

    const tiers = Array.from({ length: tierCount }, () => ({ w: 0, f0: Infinity, f1: -Infinity }));
    for (const x of picked) {
      const t = Math.max(0, Math.min(tierCount - 1, Math.floor(((x.fee - minFee) / span) * tierCount)));
      tiers[t].w += x.vsize;
      tiers[t].f0 = Math.min(tiers[t].f0, x.fee);
      tiers[t].f1 = Math.max(tiers[t].f1, x.fee);
    }
    // low -> high for palette indexing convenience
    return tiers
      .map((t, i) => ({ ...t, idx: i }))
      .filter(t => t.w > 0);
  }

  function drawStableTiles(canvas, tiers, seed, metaText) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const theme = window.ZZXTheme?.widgets?.mempoolGoggles || {};
    const palette = Array.isArray(theme.tiers) && theme.tiers.length
      ? theme.tiers
      : ["#0b3d2e","#0f5a3f","#12724f","#168a61","#1aa374","#6aa92a","#b6a11c"];

    const bg = theme.canvasBg || "#000";
    const grid = theme.gridLine || "rgba(255,255,255,0.06)";
    const tile = Number.isFinite(theme.tileSize) ? theme.tileSize : 4;
    const gap  = Number.isFinite(theme.tileGap)  ? theme.tileGap  : 1;

    const W = canvas.width, H = canvas.height;

    // Clear
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let y = 0; y <= H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    for (let x = 0; x <= W; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }

    const total = tiers.reduce((a, t) => a + t.w, 0) || 1;

    // Stable RNG
    const rnd = mulberry32(seed);

    // We want “mempool-ish” vertical dominance on the right:
    // render tiers as vertical strips, with higher fees pushed right.
    // That’s visually closer to their “filled right edge” feel than horizontal banding.
    let x0 = 0;

    // iterate low->high but draw low first (left), high last (right)
    const ordered = tiers.slice().sort((a, b) => a.idx - b.idx);

    for (let i = 0; i < ordered.length; i++) {
      const t = ordered[i];
      const stripW = Math.max(tile * 6, Math.round((t.w / total) * W));
      const x1 = (i === ordered.length - 1) ? W : Math.min(W, x0 + stripW);

      // Choose palette based on fee tier position
      const pIdx = Math.round((i / Math.max(1, ordered.length - 1)) * (palette.length - 1));
      ctx.fillStyle = palette[Math.min(palette.length - 1, Math.max(0, pIdx))];

      // Fill tiles in this strip with stable stochastic density
      // Higher fee -> denser fill
      const density = 0.68 + (i / Math.max(1, ordered.length - 1)) * 0.26; // 0.68..0.94

      for (let y = 0; y < H; y += (tile + gap)) {
        for (let x = x0; x < x1; x += (tile + gap)) {
          if (rnd() > density) continue;
          ctx.fillRect(x, y, tile, tile);
        }
      }

      x0 = x1;
      if (x0 >= W) break;
    }

    // Meta label
    if (metaText) {
      ctx.save();
      ctx.font = "12px IBMPlexMono, ui-monospace, monospace";
      ctx.fillStyle = "rgba(192,214,116,0.85)";
      ctx.fillText(metaText, 8, H - 10);
      ctx.restore();
    }
  }

  async function updateGoggles() {
    if (!mounted()) return;

    const canvas = byId("btc-goggles-canvas");
    const metaEl = $("#btc-goggles [data-meta]");
    if (!canvas) return;

    try {
      await ensureThemeLoaded();

      // Use tip height as part of seed so the pattern stays stable within a block,
      // and changes when a new block arrives.
      let tipHeight = null;
      try {
        const htxt = await tget(`${MEMPOOL}/blocks/tip/height`);
        const h = parseInt(htxt, 10);
        if (Number.isFinite(h)) tipHeight = h;
      } catch {}

      const mem = await jget(`${MEMPOOL}/mempool`);
      const hist = mem?.fee_histogram;

      const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);

      const paletteLen = (window.ZZXTheme?.widgets?.mempoolGoggles?.tiers?.length) || 7;
      const tiers = toTiers(picked, paletteLen);

      const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
      const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()}`;

      if (metaEl) metaEl.textContent = meta;

      // Seed from (tipHeight + histogram snapshot)
      const snapshot = JSON.stringify((Array.isArray(hist) ? hist.slice(0, 40) : []));
      const seedStr = `${tipHeight || "x"}|${snapshot}`;
      const seed = fnv1a32(seedStr);

      drawStableTiles(canvas, tiers, seed, meta);
    } catch (e) {
      if (metaEl) metaEl.textContent = "mempool api error";
    }
  }

  let timer = null;
  function start() {
    if (timer) return;
    updateGoggles();
    timer = setInterval(updateGoggles, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => start(), { once: true });
  } else {
    start();
  }
})();

  // ============================================================
  // scheduling (single-run guard)
  // ============================================================
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

    updateNodes();
    updateIntel();
    startQuotes();
    initGogglesFrame();

    // Timers
    setInterval(updateSpot, 250);

    setInterval(update24hGraphs, 60_000);

    setInterval(() => {
      updateHashrate();
      updateLN();
      updateFees();
      updateMempool();
      updateTipAndDrift();
      updateNodes();
    }, 15_000);

    setInterval(updateIntel, 60_000);

    // Quotes stay independent
    // (startQuotes sets its own interval)
  }

  start();
})();
