// __partials/bitcoin-ticker-widget.js
// V3 DROP-IN: robust reinjection + all widgets + satoshi-quotes.txt URL scraping via AllOrigins
// Goals:
// - NO "run once and die" guard. Instead: one global controller that can re-bind to new DOM mounts.
// - Timers created once; each tick re-checks mount and writes only if elements exist.
// - In-flight locks per job.
// - Satoshi quote now uses __partials/satoshi-quotes.txt (one URL per line) and scrapes quotes client-side.
//
// Optional debugging:
//   window.__ZZX_BTC_DEBUG = true;

(function () {
  const DEBUG = !!window.__ZZX_BTC_DEBUG;
  const log = (...a) => DEBUG && console.log("[ZZX-BTC]", ...a);
  const warn = (...a) => DEBUG && console.warn("[ZZX-BTC]", ...a);

  // If controller exists, just poke it to rebind and exit.
  if (window.__ZZX_BTC_CONTROLLER) {
    window.__ZZX_BTC_CONTROLLER.rebind();
    return;
  }

  // ---------------- Helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function mounted() {
    return !!byId("btc-value");
  }

  function setCard(id, valueText, subText) {
    const card = byId(id);
    if (!card) return false;
    const v = $('[data-val]', card);
    const s = $('[data-sub]', card);
    if (v) v.textContent = (valueText ?? "—");
    if (s && subText != null) s.textContent = subText;
    return true;
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

  async function jgetAllOrigins(targetUrl) {
    const ao = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const r = await fetch(ao, { cache: "no-store" });
    if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
    return await r.json();
  }

  async function tgetAllOrigins(targetUrl) {
    const ao = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const r = await fetch(ao, { cache: "no-store" });
    if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
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

  // ---------------- Sparkline ----------------
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

    const nums = (Array.isArray(series) ? series : []).map(Number).filter(Number.isFinite);
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

  // ---------------- In-flight locks ----------------
  const inflight = Object.create(null);
  function lock(name) {
    if (inflight[name]) return false;
    inflight[name] = true;
    return true;
  }
  function unlock(name) { inflight[name] = false; }

  // ============================================================
  // 1) Spot ticker (Coinbase)
  // ============================================================
  const SPOT = "https://api.coinbase.com/v2/prices/spot?currency=USD";

  async function updateSpot() {
    if (!mounted()) return;
    if (!lock("spot")) return;
    try {
      const data = await jget(SPOT);
      const btcPrice = parseFloat(data?.data?.amount);
      if (!Number.isFinite(btcPrice)) return;

      const a = byId("btc-value");
      const b = byId("mbtc-value");
      const c = byId("ubtc-value");
      const d = byId("sats-value");
      if (!a || !b || !c || !d) return;

      const mbtc = btcPrice * 0.001;
      const ubtc = btcPrice * 0.000001;
      const sat  = btcPrice * 0.00000001;

      a.textContent = btcPrice.toFixed(2);
      b.textContent = mbtc.toFixed(2);
      c.textContent = ubtc.toFixed(4);
      d.textContent = sat.toFixed(6);
    } catch (e) {
      warn("spot", e);
    } finally {
      unlock("spot");
    }
  }

  // ============================================================
  // 2) 24h price + volume graphs (Coinbase Exchange candles)
  // ============================================================
  const CANDLES_15M = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

  async function update24hGraphs() {
    if (!mounted()) return;
    if (!lock("graphs")) return;
    try {
      const candles = await jget(CANDLES_15M);
      if (!Array.isArray(candles) || candles.length < 2) return;

      const rows = candles.slice().reverse();
      const last96 = rows.slice(-96);

      const closes = last96.map(r => Number(r?.[4])).filter(Number.isFinite);
      if (closes.length >= 2) {
        const first = closes[0];
        const last = closes[closes.length - 1];
        const changePct = (Number.isFinite(first) && first !== 0) ? ((last - first) / first) * 100 : NaN;

        setCard("btc-24hprice", fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
        drawSpark("btc-24hprice", closes);
      }

      let totalUsd = 0;
      const volsUsd = last96.map(r => {
        const vbtc = Number(r?.[5]);
        const close = Number(r?.[4]);
        const v = (Number.isFinite(vbtc) && Number.isFinite(close)) ? (vbtc * close) : NaN;
        if (Number.isFinite(v)) totalUsd += v;
        return v;
      }).filter(Number.isFinite);

      setCard("btc-24hvolume", `$${fmtBig(totalUsd)}`, "USD");
      drawSpark("btc-24hvolume", volsUsd);
    } catch (e) {
      warn("graphs", e);
    } finally {
      unlock("graphs");
    }
  }

  // ============================================================
  // 3) mempool.space stats
  // ============================================================
  const MEMPOOL = "https://mempool.space/api";

  async function updateFees() {
    if (!mounted()) return;
    if (!lock("fees")) return;
    try {
      const f = await jget(`${MEMPOOL}/v1/fees/recommended`);
      const fast = Number(f?.fastestFee);
      const mid  = Number(f?.halfHourFee);
      const slow = Number(f?.hourFee);
      const txt = (Number.isFinite(fast) && Number.isFinite(mid) && Number.isFinite(slow))
        ? `H:${fast}  M:${mid}  L:${slow}`
        : "—";
      setCard("btc-fees", txt, "sat/vB");
    } catch (e) {
      warn("fees", e);
      setCard("btc-fees", "—", "sat/vB");
    } finally {
      unlock("fees");
    }
  }

  async function updateMempool() {
    if (!mounted()) return;
    if (!lock("mempool")) return;
    try {
      const m = await jget(`${MEMPOOL}/mempool`);
      const count = Number(m?.count);
      setCard("btc-mempool", Number.isFinite(count) ? fmtBig(count) : "—", "tx");
      // keep fee_histogram around for goggles (optional reuse)
      controller._lastFeeHistogram = m?.fee_histogram || null;
    } catch (e) {
      warn("mempool", e);
      setCard("btc-mempool", "—", "tx");
    } finally {
      unlock("mempool");
    }
  }

  async function updateTipAndDrift() {
    if (!mounted()) return;
    if (!lock("tip")) return;
    try {
      const heightText = await tget(`${MEMPOOL}/blocks/tip/height`);
      const h = parseInt(String(heightText).trim(), 10);
      setCard("btc-tip", Number.isFinite(h) ? String(h) : "—", "height");

      const blocks = await jget(`${MEMPOOL}/blocks`);
      const arr = Array.isArray(blocks) ? blocks : [];
      const tip = arr[0];
      const tsTip = Number(tip?.timestamp);

      if (!Number.isFinite(tsTip)) {
        setCard("btc-clockdrift", "—", "vs last block");
        return;
      }

      const sinceSec = Math.max(0, Math.round(Date.now() / 1000 - tsTip));
      const sinceMin = sinceSec / 60;

      const N = 6;
      const ts = arr.slice(0, N).map(b => Number(b?.timestamp)).filter(Number.isFinite);
      let avgMin = NaN;
      if (ts.length >= 2) {
        const diffs = [];
        for (let i = 0; i < ts.length - 1; i++) diffs.push(ts[i] - ts[i + 1]);
        const avgSec = diffs.reduce((a, x) => a + x, 0) / diffs.length;
        avgMin = avgSec / 60;
      }

      const delta10 = Number.isFinite(avgMin) ? (avgMin - 10) : NaN;
      const sub = Number.isFinite(avgMin)
        ? `avg:${avgMin.toFixed(1)}m  Δ10:${delta10 >= 0 ? "+" : ""}${delta10.toFixed(1)}m`
        : `avg:—`;

      setCard("btc-clockdrift", `+${sinceMin.toFixed(1)}m`, sub);
    } catch (e) {
      warn("tip/drift", e);
      setCard("btc-tip", "—", "height");
      setCard("btc-clockdrift", "—", "vs last block");
    } finally {
      unlock("tip");
    }
  }

  async function updateHashrate() {
    if (!mounted()) return;
    if (!lock("hashrate")) return;

    const candidates = [
      `${MEMPOOL}/v1/mining/hashrate/3d`,
      `${MEMPOOL}/v1/mining/hashrate/7d`,
      `${MEMPOOL}/v1/mining/hashrate`,
    ];

    try {
      for (const u of candidates) {
        try {
          const data = await jget(u);
          let seriesEH = [];

          if (Array.isArray(data)) {
            seriesEH = data
              .map(x => Number(x?.hashrate ?? x?.value))
              .filter(Number.isFinite)
              .map(hs => hs / 1e18);
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
    } catch (e) {
      warn("hashrate", e);
      setCard("btc-hashrate", "—", "EH/s");
    } finally {
      unlock("hashrate");
    }
  }

  // ============================================================
  // 4) Lightning (mempool.space)
  // ============================================================
  async function updateLN() {
    if (!mounted()) return;
    if (!lock("ln")) return;

    const candidates = [
      `${MEMPOOL}/v1/lightning/statistics`,
      `${MEMPOOL}/v1/lightning`,
      `${MEMPOOL}/v1/lightning/network`,
    ];

    try {
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

      if (Number.isFinite(cap)) setCard("btc-lnstats", fmtBig(cap), "BTC cap");
      else if (Number.isFinite(nodes)) setCard("btc-lnstats", fmtBig(nodes), "LN nodes");
      else setCard("btc-lnstats", "—", "capacity");

      const d = byId("btc-ln-detail");
      if (d) {
        const capEl = d.querySelector("[data-cap]");
        const nodesEl = d.querySelector("[data-nodes]");
        const chansEl = d.querySelector("[data-chans]");
        if (capEl) capEl.textContent = Number.isFinite(cap) ? `${fmtBig(cap)} BTC` : "—";
        if (nodesEl) nodesEl.textContent = Number.isFinite(nodes) ? fmtBig(nodes) : "—";
        if (chansEl) chansEl.textContent = Number.isFinite(chans) ? fmtBig(chans) : "—";
      }
    } catch (e) {
      warn("ln", e);
      setCard("btc-lnstats", "—", "capacity");
    } finally {
      unlock("ln");
    }
  }

  // ============================================================
  // 5) Nodes (Bitnodes via AllOrigins) + Nations totals
  // ============================================================
  const BITNODES_SNAPSHOT = "https://bitnodes.io/api/v1/snapshots/latest/";
  const BITNODES_COUNTRIES = "https://bitnodes.io/api/v1/countries/";

  function renderNations(pairs, totals) {
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

    (pairs || []).slice(0, 10).forEach(([cc, n]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="cc">${cc}</span><span class="n">${n}</span>`;
      host.appendChild(row);
    });

    if (!pairs || !pairs.length) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="cc">—</span><span class="n">—</span>`;
      host.appendChild(row);
    }
  }

  async function updateNodes() {
    if (!mounted()) return;
    if (!lock("nodes")) return;

    try {
      // Snapshot (reachable/total)
      let snap = null;
      try { snap = await jgetAllOrigins(BITNODES_SNAPSHOT); } catch (_) {}
      if (!snap || typeof snap !== "object") throw new Error("bitnodes snapshot missing");

      const total = Number(snap?.total_nodes ?? snap?.total ?? snap?.count);
      const reachable = Number(snap?.reachable_nodes ?? snap?.reachable ?? snap?.total_reachable);
      const unreachable = (Number.isFinite(total) && Number.isFinite(reachable)) ? (total - reachable) : NaN;

      setCard(
        "btc-nodecount",
        Number.isFinite(reachable) ? fmtBig(reachable) : (Number.isFinite(total) ? fmtBig(total) : "—"),
        "reachable"
      );

      // Countries (top list)
      let countries = null;
      try { countries = await jgetAllOrigins(BITNODES_COUNTRIES); } catch (_) {}
      // bitnodes countries endpoint often returns {"countries":[["US", 1234], ...]} or {"results":...}
      let pairs = [];

      if (countries) {
        if (Array.isArray(countries?.countries)) {
          pairs = countries.countries
            .map(x => [String(x?.[0] || "").toUpperCase(), Number(x?.[1])])
            .filter(([cc, n]) => cc && Number.isFinite(n))
            .sort((a, b) => b[1] - a[1])
            .map(([cc, n]) => [cc, fmtBig(n)]);
        } else if (Array.isArray(countries?.results)) {
          pairs = countries.results
            .map(x => [String(x?.country || x?.code || "").toUpperCase(), Number(x?.count)])
            .filter(([cc, n]) => cc && Number.isFinite(n))
            .sort((a, b) => b[1] - a[1])
            .map(([cc, n]) => [cc, fmtBig(n)]);
        } else if (countries && typeof countries === "object") {
          // fallback: if it’s a map {US:123,...}
          pairs = Object.entries(countries)
            .map(([cc, n]) => [String(cc).toUpperCase(), Number(n)])
            .filter(([, n]) => Number.isFinite(n))
            .sort((a, b) => b[1] - a[1])
            .map(([cc, n]) => [cc, fmtBig(n)]);
        }
      }

      renderNations(pairs, {
        total: Number.isFinite(total) ? fmtBig(total) : "—",
        reachable: Number.isFinite(reachable) ? fmtBig(reachable) : "—",
        unreachable: Number.isFinite(unreachable) ? fmtBig(unreachable) : "—",
      });
    } catch (e) {
      warn("nodes", e);
      setCard("btc-nodecount", "—", "reachable");
      renderNations([], { total: "—", reachable: "—", unreachable: "—" });
    } finally {
      unlock("nodes");
    }
  }

  // ============================================================
  // 6) Intel + News (use same renderer if both cards exist)
  // ============================================================
  const GH = "https://api.github.com";
  const INTEL_REPOS = ["bitcoin/bitcoin", "bitcoin/bips", "lightning/bolts", "lightningnetwork/lnd"];
  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story";

  function renderNewsCard(hostId, items) {
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
      row.innerHTML = `<span class="btc-news__src">news</span><a href="#" tabindex="-1">no items</a>`;
      list.appendChild(row);
    }
  }

  const intelCache = { ts: 0, items: [] };

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

  async function updateIntelAndNews() {
    if (!mounted()) return;
    if (!lock("intel")) return;

    try {
      const now = Date.now();

      if (intelCache.items.length && (now - intelCache.ts) < 60_000) {
        renderNewsCard("btc-intel", intelCache.items);
        renderNewsCard("btc-news", intelCache.items);
        return;
      }

      const items = [];

      // GH: 2 repos per minute round-robin
      try {
        const idx = Math.floor(now / 60_000) % INTEL_REPOS.length;
        const batch = [INTEL_REPOS[idx], INTEL_REPOS[(idx + 1) % INTEL_REPOS.length]];
        for (const repo of batch) items.push(await ghLatestCommit(repo));
      } catch (_) {}

      // HN
      try {
        const data = await jget(HN_QUERY);
        const hits = Array.isArray(data?.hits) ? data.hits : [];
        const hn = hits.slice(0, 6).map(h => ({
          source: "HN",
          title: h.title || h.story_title || "—",
          url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          ts: h.created_at_i ? (h.created_at_i * 1000) : 0,
        }));
        items.push(...hn);
      } catch (_) {}

      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      intelCache.ts = now;
      intelCache.items = items;

      // Render to both if both exist
      renderNewsCard("btc-intel", items);
      renderNewsCard("btc-news", items);
    } finally {
      unlock("intel");
    }
  }

  // ============================================================
  // 7) Satoshi quotes from __partials/satoshi-quotes.txt (URL list)
  // ============================================================
  const QUOTE_URL_LIST = "/__partials/satoshi-quotes.txt";
  const QUOTE_FALLBACK = {
    q: "The root problem with conventional currency is all the trust that's required to make it work.",
    src: "Satoshi (2009)",
    url: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source"
  };

  const quoteState = {
    urls: null,
    cache: new Map(), // url -> [{q, src, url}]
    timer: null,
  };

  function renderQuote(item) {
    const card = byId("btc-satoshiquote");
    if (!card) return;
    const qt = card.querySelector("[data-quote]");
    const src = card.querySelector("[data-src]");
    const link = card.querySelector("[data-link]");
    if (qt) qt.textContent = `“${item?.q || "—"}”`;
    if (src) src.textContent = item?.src || "Satoshi";
    if (link) {
      link.href = item?.url || "https://satoshi.nakamotoinstitute.org/quotes/";
      link.textContent = "source";
    }
  }

  async function loadQuoteUrlList() {
    if (quoteState.urls) return quoteState.urls;
    const txt = await fetch(QUOTE_URL_LIST, { cache: "no-store" }).then(r => r.ok ? r.text() : "");
    const urls = txt
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("#"));
    quoteState.urls = urls.length ? urls : [];
    return quoteState.urls;
  }

  function parseQuotesFromNakamotoInstituteHTML(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Robust: collect all blockquotes + nearby attribution
    const blocks = Array.from(doc.querySelectorAll("blockquote"));
    const out = [];

    for (const bq of blocks) {
      const q = (bq.textContent || "").trim().replace(/\s+/g, " ");
      if (!q || q.length < 20) continue;

      // Try to find a nearby citation/attribution
      let src = "Satoshi";
      const cite =
        bq.parentElement?.querySelector("cite") ||
        bq.nextElementSibling?.querySelector?.("cite") ||
        bq.closest("article")?.querySelector("cite");

      if (cite && cite.textContent) src = cite.textContent.trim().replace(/\s+/g, " ");

      // Try to find a permalink for that quote (best effort)
      let url = pageUrl;
      const a =
        bq.parentElement?.querySelector('a[href*="nakamotoinstitute"], a[href^="/quotes/"], a[href^="#"]') ||
        bq.querySelector('a[href]');
      if (a?.getAttribute) {
        const href = a.getAttribute("href");
        if (href) {
          try {
            url = new URL(href, pageUrl).toString();
          } catch {}
        }
      }

      out.push({ q, src, url });
    }

    // If their markup uses dedicated quote blocks instead:
    if (!out.length) {
      const qEls = Array.from(doc.querySelectorAll(".quote, .quotes, .quote__text, .quote-text, .quote-content"));
      for (const el of qEls) {
        const q = (el.textContent || "").trim().replace(/\s+/g, " ");
        if (q && q.length >= 20) out.push({ q, src: "Satoshi", url: pageUrl });
      }
    }

    return out;
  }

  async function pickAndRenderSatoshiQuote() {
    if (!mounted()) return;
    if (!byId("btc-satoshiquote")) return;

    try {
      const urls = await loadQuoteUrlList();
      if (!urls.length) {
        renderQuote(QUOTE_FALLBACK);
        return;
      }

      // pick a random category page
      const pageUrl = urls[Math.floor(Math.random() * urls.length)];

      // cache per page
      if (!quoteState.cache.has(pageUrl)) {
        const html = await tgetAllOrigins(pageUrl);
        const quotes = parseQuotesFromNakamotoInstituteHTML(html, pageUrl);
        quoteState.cache.set(pageUrl, quotes);
      }

      const quotes = quoteState.cache.get(pageUrl) || [];
      if (!quotes.length) {
        renderQuote({ ...QUOTE_FALLBACK, url: pageUrl });
        return;
      }

      const item = quotes[Math.floor(Math.random() * quotes.length)];
      renderQuote(item);
    } catch (e) {
      warn("satoshi quote", e);
      renderQuote(QUOTE_FALLBACK);
    }
  }

  function startSatoshiQuotes() {
    if (quoteState.timer) return;
    // prime once immediately
    pickAndRenderSatoshiQuote();
    // rotate
    quoteState.timer = setInterval(pickAndRenderSatoshiQuote, 45_000);
  }

  // ============================================================
  // 8) Goggles canvas (your “in-family” block/0 approximation)
  // ============================================================
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

  async function ensureThemeLoaded() {
    if (window.ZZXTheme?.widgets?.mempoolGoggles) return;
    if (document.querySelector('script[data-zzx-theme="1"]')) return;

    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "/static/js/theme.js";
      s.defer = true;
      s.dataset.zzxTheme = "1";
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  function computeNextBlockFromHistogram(hist, targetVSize = 1_000_000) {
    const rows = (Array.isArray(hist) ? hist : [])
      .map(([fee, vsize]) => [Number(fee), Number(vsize)])
      .filter(([fee, vsize]) => Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0);

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

    const tiers = Array.from({ length: tierCount }, () => ({ w: 0 }));
    for (const x of picked) {
      const t = Math.max(0, Math.min(tierCount - 1, Math.floor(((x.fee - minFee) / span) * tierCount)));
      tiers[t].w += x.vsize;
    }
    return tiers.map((t, i) => ({ idx: i, w: t.w })).filter(t => t.w > 0);
  }

  function drawStableTiles(canvas, tiers, seed, metaText) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const theme = window.ZZXTheme?.widgets?.mempoolGoggles || {};
    const palette = Array.isArray(theme.tiers) && theme.tiers.length
      ? theme.tiers
      : ["#0b3d2e", "#0f5a3f", "#12724f", "#168a61", "#1aa374", "#6aa92a", "#b6a11c"];

    const bg = theme.canvasBg || "#000";
    const grid = theme.gridLine || "rgba(255,255,255,0.06)";
    const tile = Number.isFinite(theme.tileSize) ? theme.tileSize : 4;
    const gap = Number.isFinite(theme.tileGap) ? theme.tileGap : 1;

    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let y = 0; y <= H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    for (let x = 0; x <= W; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }

    const total = tiers.reduce((a, t) => a + t.w, 0) || 1;
    const rnd = mulberry32(seed);

    let x0 = 0;
    const ordered = tiers.slice().sort((a, b) => a.idx - b.idx);

    for (let i = 0; i < ordered.length; i++) {
      const stripW = Math.max(tile * 6, Math.round((ordered[i].w / total) * W));
      const x1 = (i === ordered.length - 1) ? W : Math.min(W, x0 + stripW);

      const pIdx = Math.round((i / Math.max(1, ordered.length - 1)) * (palette.length - 1));
      ctx.fillStyle = palette[Math.min(palette.length - 1, Math.max(0, pIdx))];

      const density = 0.68 + (i / Math.max(1, ordered.length - 1)) * 0.26;

      for (let y = 0; y < H; y += (tile + gap)) {
        for (let x = x0; x < x1; x += (tile + gap)) {
          if (rnd() > density) continue;
          ctx.fillRect(x, y, tile, tile);
        }
      }

      x0 = x1;
      if (x0 >= W) break;
    }

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
    if (!lock("goggles")) return;

    try {
      const canvas = byId("btc-goggles-canvas") || $("#btc-goggles canvas");
      if (!canvas) return;

      await ensureThemeLoaded();

      let tipHeight = null;
      try {
        const htxt = await tget(`${MEMPOOL}/blocks/tip/height`);
        const h = parseInt(String(htxt).trim(), 10);
        if (Number.isFinite(h)) tipHeight = h;
      } catch (_) {}

      // reuse last histogram when available (smoother)
      let hist = controller._lastFeeHistogram;
      if (!hist) {
        const m = await jget(`${MEMPOOL}/mempool`);
        hist = m?.fee_histogram;
        controller._lastFeeHistogram = hist || null;
      }

      const { picked, used, targetVSize } = computeNextBlockFromHistogram(hist, 1_000_000);
      const paletteLen = (window.ZZXTheme?.widgets?.mempoolGoggles?.tiers?.length) || 7;
      const tiers = toTiers(picked, paletteLen);

      const pct = Math.max(0, Math.min(100, (used / targetVSize) * 100));
      const meta = `block/0 fill: ${pct.toFixed(1)}% · vB: ${Math.round(used).toLocaleString()}`;

      const metaEl = $("#btc-goggles [data-meta]") || $("#btc-goggles [data-sub]");
      if (metaEl) metaEl.textContent = meta;

      const snapshot = JSON.stringify((Array.isArray(hist) ? hist.slice(0, 40) : []));
      const seed = fnv1a32(`${tipHeight || "x"}|${snapshot}`);

      // Ensure crisp rendering: set internal canvas resolution once
      if (!canvas.dataset.__zzxSized) {
        const cssW = canvas.clientWidth || 320;
        const cssH = canvas.clientHeight || 220;
        canvas.width = Math.max(240, Math.floor(cssW * (window.devicePixelRatio || 1)));
        canvas.height = Math.max(160, Math.floor(cssH * (window.devicePixelRatio || 1)));
        canvas.dataset.__zzxSized = "1";
      }

      drawStableTiles(canvas, tiers, seed, meta);
    } catch (e) {
      warn("goggles", e);
      const metaEl = $("#btc-goggles [data-meta]") || $("#btc-goggles [data-sub]");
      if (metaEl) metaEl.textContent = "mempool api error";
    } finally {
      unlock("goggles");
    }
  }

  // ============================================================
  // Controller: one set of timers, rebind-safe
  // ============================================================
  const controller = {
    _timers: [],
    _bound: false,
    _lastFeeHistogram: null,

    prime() {
      if (!mounted()) return;
      log("prime");

      // Prime all (non-blocking; each updater locks itself)
      updateSpot();
      update24hGraphs();
      updateHashrate();
      updateNodes();
      updateLN();
      updateMempool();
      updateFees();
      updateTipAndDrift();
      updateIntelAndNews();
      startSatoshiQuotes();
      updateGoggles();
    },

    startTimers() {
      if (this._bound) return;
      this._bound = true;

      this._timers.push(setInterval(() => { if (mounted()) updateSpot(); }, 250));
      this._timers.push(setInterval(() => { if (mounted()) update24hGraphs(); }, 60_000));

      this._timers.push(setInterval(() => {
        if (!mounted()) return;
        updateHashrate();
        updateNodes();
        updateLN();
        updateMempool();
        updateFees();
        updateTipAndDrift();
        updateGoggles();
      }, 15_000));

      this._timers.push(setInterval(() => { if (mounted()) updateIntelAndNews(); }, 60_000));

      // mount watcher (lightweight): if fragment reinjected, prime once
      this._timers.push(setInterval(() => this.rebind(), 900));
    },

    rebind() {
      // If the fragment appears (or reappears), prime.
      if (!mounted()) return;
      // Use a token that changes if element is replaced
      const el = byId("btc-value");
      if (!el) return;
      const tok = el.dataset.__zzxTok || (el.dataset.__zzxTok = String(Date.now() + Math.random()));
      if (this._lastTok === tok) return;
      this._lastTok = tok;
      this.prime();
    },
  };

  window.__ZZX_BTC_CONTROLLER = controller;

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      controller.startTimers();
      controller.rebind();
    }, { once: true });
  } else {
    controller.startTimers();
    controller.rebind();
  }
})();
