// __partials/bitcoin-ticker-widget.js
// Multi-widget updater. Safe if fragment is missing or re-injected.
// Runs once per page (ticker-loader loads it once).

(function () {
  // ----- helpers -----
  const $ = (sel, root = document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function mounted() {
    return !!byId("btc-value"); // fragment present
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

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtBig(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e12) return sign + (abs/1e12).toFixed(2) + "T";
    if (abs >= 1e9)  return sign + (abs/1e9).toFixed(2)  + "B";
    if (abs >= 1e6)  return sign + (abs/1e6).toFixed(2)  + "M";
    if (abs >= 1e3)  return sign + (abs/1e3).toFixed(2)  + "K";
    return sign + abs.toFixed(2);
  }

  // ----- SVG sparkline -----
  function ensureSpark(cardId) {
    const card = byId(cardId);
    if (!card) return null;
    let svg = $(".btc-spark", card);
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("btc-spark");
      svg.setAttribute("viewBox", "0 0 120 38");
      svg.innerHTML = `
        <path class="grid" d="M0 19 H120"></path>
        <path class="fill" d=""></path>
        <path class="line" d=""></path>
      `;
      card.appendChild(svg);
    }
    return svg;
  }

  function drawSpark(cardId, series) {
    const svg = ensureSpark(cardId);
    if (!svg) return;

    const pts = (Array.isArray(series) ? series : []).filter(Number.isFinite);
    if (pts.length < 2) return;

    const W = 120, H = 38;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = (max - min) || 1;

    const toX = (i) => (i * (W / (pts.length - 1)));
    const toY = (v) => {
      const t = (v - min) / span;
      return (H - 3) - t * (H - 6);
    };

    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const x = toX(i);
      const y = toY(pts[i]);
      d += (i === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)}` : ` L${x.toFixed(2)} ${y.toFixed(2)}`);
    }

    const fill = `${d} L${W} ${H} L0 ${H} Z`;

    const linePath = svg.querySelector("path.line");
    const fillPath = svg.querySelector("path.fill");
    if (linePath) linePath.setAttribute("d", d);
    if (fillPath) fillPath.setAttribute("d", fill);
  }

  // ============================================================
  // 1) Primary spot ticker (Coinbase)
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

      byId("btc-value").textContent  = btcPrice.toFixed(2);
      byId("mbtc-value").textContent = mbtc.toFixed(2);
      byId("ubtc-value").textContent = ubtc.toFixed(4);
      byId("sats-value").textContent = sat.toFixed(6);
    } catch (_) {}
  }

  // ============================================================
  // 2) 24h price + volume with sparklines (Coinbase Exchange candles)
  // ============================================================
  // Candles endpoint is commonly:
  // https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600
  // Returns array of [time, low, high, open, close, volume]
  const CANDLES_1H = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600";

  async function update24hGraphs() {
    if (!mounted()) return;

    try {
      const candles = await jget(CANDLES_1H);
      if (!Array.isArray(candles) || candles.length < 2) return;

      // Coinbase returns newest-first; normalize oldest-first
      const rows = candles.slice(0, 24).reverse();

      const closes = rows.map(r => parseFloat(r?.[4]));
      const volsBtc = rows.map(r => parseFloat(r?.[5]));

      const last = closes[closes.length - 1];
      const first = closes[0];
      const changePct = (Number.isFinite(first) && first !== 0 && Number.isFinite(last))
        ? ((last - first) / first) * 100
        : NaN;

      setCard("btc-24hprice", `$${fmtUSD(last)}`, Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
      drawSpark("btc-24hprice", closes);

      // Convert volume to approx USD using close
      const volsUsd = volsBtc.map((v, i) => (Number.isFinite(v) && Number.isFinite(closes[i])) ? v * closes[i] : NaN);
      const sumUsd = volsUsd.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

      setCard("btc-24hvolume", `$${fmtBig(sumUsd)}`, "USD");
      drawSpark("btc-24hvolume", volsUsd);
    } catch (_) {
      // leave stale, no spam
    }
  }

  // ============================================================
  // 3) mempool.space: hashrate, LN, fees, mempool, tip height + drift
  // ============================================================
  const MEMPOOL = "https://mempool.space/api";

  async function updateHashrate() {
    if (!mounted()) return;
    try {
      // Common mempool endpoint (may vary by deployment):
      // /api/v1/mining/hashrate/3d -> [{timestamp, hashrate}]
      const data = await jget(`${MEMPOOL}/v1/mining/hashrate/3d`);
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.hashrates) ? data.hashrates : []);
      const last = arr[arr.length - 1];
      const hr = parseFloat(last?.hashrate ?? last?.avgHashrate ?? last?.value);
      // mempool typically reports H/s; convert to EH/s if large
      const eh = Number.isFinite(hr) ? (hr / 1e18) : NaN;
      setCard("btc-hashrate", Number.isFinite(eh) ? eh.toFixed(2) : "—", "EH/s");

      // optional spark if you want it
      const series = arr.map(x => parseFloat(x?.hashrate ?? x?.avgHashrate ?? x?.value) / 1e18);
      drawSpark("btc-hashrate", series.filter(Number.isFinite));
    } catch (_) {
      setCard("btc-hashrate", "—", "EH/s");
    }
  }

  async function updateFees() {
    if (!mounted()) return;
    try {
      // /api/v1/fees/recommended -> { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
      const f = await jget(`${MEMPOOL}/v1/fees/recommended`);
      const fast = parseFloat(f?.fastestFee);
      const mid  = parseFloat(f?.halfHourFee);
      const slow = parseFloat(f?.hourFee);

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
      // /api/mempool -> { count, vsize, total_fee, ... }
      const m = await jget(`${MEMPOOL}/mempool`);
      const count = parseFloat(m?.count);
      setCard("btc-mempool", Number.isFinite(count) ? fmtBig(count) : "—", "tx");
    } catch (_) {
      setCard("btc-mempool", "—", "tx");
    }
  }

  async function updateTipAndDrift() {
    if (!mounted()) return;
    try {
      const height = await fetch(`${MEMPOOL}/blocks/tip/height`, { cache: "no-store" }).then(r => r.ok ? r.text() : null);
      const h = height ? parseInt(height, 10) : NaN;
      setCard("btc-tip", Number.isFinite(h) ? String(h) : "—", "height");

      // /api/blocks/tip gives a block object with timestamp
      const tip = await jget(`${MEMPOOL}/blocks/tip`);
      const ts = parseFloat(tip?.timestamp); // seconds
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

  async function updateLN() {
    if (!mounted()) return;
    try {
      // mempool has LN endpoints; shape varies by deployment.
      // Common-ish: /api/v1/lightning/statistics or /api/v1/lightning
      let ln = null;
      try { ln = await jget(`${MEMPOOL}/v1/lightning/statistics`); } catch (_) {}
      if (!ln) {
        try { ln = await jget(`${MEMPOOL}/v1/lightning`); } catch (_) {}
      }

      const cap = parseFloat(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity);
      const nodes = parseFloat(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);
      if (Number.isFinite(cap)) {
        // capacity often in BTC; show BTC
        setCard("btc-lnstats", Number.isFinite(cap) ? fmtBig(cap) : "—", "BTC cap");
      } else if (Number.isFinite(nodes)) {
        setCard("btc-lnstats", fmtBig(nodes), "LN nodes");
      } else {
        setCard("btc-lnstats", "—", "capacity");
      }
    } catch (_) {
      setCard("btc-lnstats", "—", "capacity");
    }
  }

  // ============================================================
  // 4) Intel feeds: GitHub repos + Hacker News only
  // ============================================================
  const GH = "https://api.github.com";
  const INTEL_REPOS = [
    { key: "bitcoin",  repo: "bitcoin/bitcoin" },
    { key: "bips",     repo: "bitcoin/bips" },
    { key: "bolts",    repo: "lightning/bolts" },
    { key: "lnd",      repo: "lightningnetwork/lnd" },
  ];

  function renderList(hostId, items) {
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

  async function ghLatestCommits(repo, n = 2) {
    const url = `${GH}/repos/${repo}/commits?per_page=${n}`;
    const arr = await jget(url, { headers: { "Accept": "application/vnd.github+json" } });
    return (Array.isArray(arr) ? arr : []).map(c => ({
      source: repo.split("/")[0],
      title: `${repo.split("/")[1]}: ${String(c?.commit?.message || "").split("\n")[0].slice(0, 90)}`,
      url: c?.html_url || `https://github.com/${repo}`,
      ts: c?.commit?.author?.date ? Date.parse(c.commit.author.date) : null
    }));
  }

  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story";

  async function updateIntel() {
    if (!mounted()) return;

    const items = [];

    // GitHub commits
    try {
      for (const r of INTEL_REPOS) {
        const commits = await ghLatestCommits(r.repo, 2);
        items.push(...commits.map(x => ({ ...x, source: "GH" })));
      }
    } catch (_) {}

    // Hacker News bitcoin-ish
    try {
      const data = await jget(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const hn = hits.slice(0, 4).map(h => ({
        source: "HN",
        title: h.title || h.story_title || "—",
        url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        ts: h.created_at_i ? h.created_at_i * 1000 : null
      }));
      items.push(...hn);
    } catch (_) {}

    // Sort newest first if timestamps exist
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    renderList("btc-intel", items);
  }

  // ============================================================
  // Scheduling
  // ============================================================
  let tSpot = null, tGraphs = null, tMempool = null, tIntel = null;

  function start() {
    if (tSpot) return;

    updateSpot();
    update24hGraphs();

    updateHashrate();
    updateLN();
    updateFees();
    updateMempool();
    updateTipAndDrift();

    updateIntel();

    tSpot   = setInterval(updateSpot, 250);
    tGraphs = setInterval(update24hGraphs, 30_000);

    tMempool = setInterval(() => {
      updateHashrate();
      updateLN();
      updateFees();
      updateMempool();
      updateTipAndDrift();
    }, 15_000);

    tIntel  = setInterval(updateIntel, 60_000);
  }

  start();
})();
