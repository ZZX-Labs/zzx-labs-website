// __partials/bitcoin-ticker-widget.js
// Multi-widget updater. Safe if fragment is missing or re-injected.
// Runs once per page (ticker-loader loads it once).

(function () {
  // ----- helpers -----
  const $ = (sel, root = document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function setCard(id, valueText, subText) {
    const card = byId(id);
    if (!card) return;
    const v = $('[data-val]', card);
    const s = $('[data-sub]', card);
    if (v) v.textContent = valueText ?? '—';
    if (s && subText != null) s.textContent = subText;
  }

  async function jget(url, opts) {
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }

  function mounted() {
    // if primary span exists, fragment is present
    return !!byId("btc-value");
  }

  // ----- 1) Primary spot ticker (Coinbase) -----
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
    } catch (e) {
      // silent-ish; don't spam
      // console.warn("[spot] failed", e);
    }
  }

  // ----- 2) 24h price + volume (Coinbase 24h stats) -----
  // NOTE: This endpoint is widely used, but if you swap providers later, keep the card contract.
  const STATS_24H = "https://api.exchange.coinbase.com/products/BTC-USD/stats";

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBig(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1e12) return (n/1e12).toFixed(2) + "T";
    if (n >= 1e9)  return (n/1e9).toFixed(2)  + "B";
    if (n >= 1e6)  return (n/1e6).toFixed(2)  + "M";
    if (n >= 1e3)  return (n/1e3).toFixed(2)  + "K";
    return String(n.toFixed(2));
  }

  async function update24h() {
    if (!mounted()) return;
    try {
      const s = await jget(STATS_24H);
      const open = parseFloat(s?.open);
      const last = parseFloat(s?.last);
      const vol  = parseFloat(s?.volume); // BTC volume
      const changePct = (Number.isFinite(open) && open !== 0 && Number.isFinite(last))
        ? ((last - open) / open) * 100
        : NaN;

      setCard("btc-24hprice", fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
      // Volume in USD approx = BTC vol * last
      const volUSD = (Number.isFinite(vol) && Number.isFinite(last)) ? vol * last : NaN;
      setCard("btc-24hvolume", fmtBig(volUSD), "USD");
    } catch (e) {
      setCard("btc-24hprice", "—", "—");
      setCard("btc-24hvolume", "—", "USD");
    }
  }

  // ----- 3) Network stats (placeholders with safe contracts) -----
  // Pick the providers you want; most “good” sources will require:
  // - either permissive CORS
  // - or a tiny server proxy endpoint (/api/btc/...)
  //
  // For now: these will show — until you wire endpoints.

  async function updateHashrate() {
    // Example target later: your own endpoint /api/btc/hashrate
    // setCard("btc-hashrate", "650", "EH/s");
    setCard("btc-hashrate", "—", "EH/s");
  }

  async function updateNodecount() {
    // Example later: /api/btc/nodecount
    setCard("btc-nodecount", "—", "reachable");
  }

  async function updateLN() {
    // Example later: /api/btc/lightning
    setCard("btc-lnstats", "—", "capacity");
  }

  // ----- 4) Newsfeed: do it right (client renders; server fetches) -----
  // Browser cannot reliably fetch AP/cyber news directly (CORS/licensing).
  // Correct design:
  //   GET /api/news?keywords=bitcoin,satoshi,hal%20finney,bip,lightning,lnd
  // returns: [{source,title,url,ts}]
  //
  // Until you add the endpoint, we can still pull Hacker News (public API) as a stopgap.

  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin&tags=story";

  function renderNews(items) {
    const box = byId("btc-newsfeed");
    if (!box) return;
    const list = $(".btc-news__list", box);
    if (!list) return;

    list.innerHTML = "";
    items.slice(0, 6).forEach(it => {
      const row = document.createElement("div");
      row.className = "btc-news__item";

      const src = document.createElement("span");
      src.className = "btc-news__src";
      src.textContent = it.source || "news";

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

  async function updateNews() {
    if (!mounted()) return;

    // Preferred: your own backend aggregator
    // const url = "/api/news?keywords=bitcoin,satoshi%20nakamoto,hal%20finney,bip,lightning,lnd";
    // try { const items = await jget(url); renderNews(items); return; } catch {}

    // Stopgap: Hacker News (works client-side)
    try {
      const data = await jget(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const items = hits.map(h => ({
        source: "HN",
        title: h.title || h.story_title || "—",
        url: h.url || h.story_url || "#",
        ts: h.created_at_i ? h.created_at_i * 1000 : null,
      }));
      renderNews(items);
    } catch {
      renderNews([]);
    }
  }

  // ----- scheduling -----
  // Spot: fast (250ms like you wanted)
  // 24h + stats: slower
  // News: slow

  let tSpot = null, t24 = null, tStats = null, tNews = null;

  function start() {
    if (tSpot) return; // already running
    updateSpot();
    update24h();
    updateHashrate();
    updateNodecount();
    updateLN();
    updateNews();

    tSpot  = setInterval(updateSpot, 250);
    t24    = setInterval(update24h, 10_000);
    tStats = setInterval(() => { updateHashrate(); updateNodecount(); updateLN(); }, 15_000);
    tNews  = setInterval(updateNews, 60_000);
  }

  start();
})();
