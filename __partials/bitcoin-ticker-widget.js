// __partials/bitcoin-ticker-widget.js
// Multi-widget updater + quote rotator. Safe if fragment is missing or re-injected.
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
    } catch (_) {}
  }

  // ----- 2) 24h price + volume (Coinbase 24h stats) -----
  const STATS_24H = "https://api.exchange.coinbase.com/products/BTC-USD/stats";

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBig(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + "K";
    return String(n.toFixed(2));
  }

  async function update24h() {
    if (!mounted()) return;
    try {
      const s = await jget(STATS_24H);
      const open = parseFloat(s?.open);
      const last = parseFloat(s?.last);
      const vol  = parseFloat(s?.volume); // BTC volume

      const changePct =
        (Number.isFinite(open) && open !== 0 && Number.isFinite(last))
          ? ((last - open) / open) * 100
          : NaN;

      setCard("btc-24hprice", fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");

      const volUSD = (Number.isFinite(vol) && Number.isFinite(last)) ? vol * last : NaN;
      setCard("btc-24hvolume", fmtBig(volUSD), "USD");
    } catch (_) {
      setCard("btc-24hprice", "—", "—");
      setCard("btc-24hvolume", "—", "USD");
    }
  }

  // ----- 3) Network stats placeholders (safe contract) -----
  async function updateHashrate() { setCard("btc-hashrate",  "—", "EH/s"); }
  async function updateNodecount(){ setCard("btc-nodecount", "—", "reachable"); }
  async function updateLN()       { setCard("btc-lnstats",   "—", "capacity"); }

  // ----- 4) Newsfeed stopgap (HN) -----
  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin&tags=story";

  function renderNews(items) {
    const box = byId("btc-newsfeed");
    if (!box) return;
    const list = $(".btc-news__list", box);
    if (!list) return;

    list.innerHTML = "";
    items.slice(0, 6).forEach((it) => {
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

    // Preferred later: your backend aggregator (/api/news?...). Leaving stub in place.
    try {
      const data = await jget(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const items = hits.map((h) => ({
        source: "HN",
        title: h.title || h.story_title || "—",
        url: h.url || h.story_url || "#",
        ts: h.created_at_i ? h.created_at_i * 1000 : null,
      }));
      renderNews(items);
    } catch (_) {
      renderNews([]);
    }
  }

  // ----- 8) Satoshi quote rotation -----
  const QUOTES_FALLBACK = [
    {
      q: "The root problem with conventional currency is all the trust that's required to make it work.",
      src: "Satoshi, P2P Foundation (2009)",
      url: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source",
    },
    {
      q: "I'm sure that in 20 years there will either be very large transaction volume or no volume.",
      src: "Satoshi (quotes index)",
      url: "https://nakamotoinstitute.org/quotes/",
    },
    {
      q: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.",
      src: "Satoshi (quotes index)",
      url: "https://nakamotoinstitute.org/quotes/",
    },
    {
      q: "It might make sense just to get some in case it catches on.",
      src: "Satoshi (quotes index)",
      url: "https://nakamotoinstitute.org/quotes/",
    },
  ];

  const QUOTES_JSON = "/static/data/satoshi-quotes.json";
  let __quotes = null;
  let __quoteTimer = null;

  async function loadQuotesList() {
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

    const qt   = card.querySelector("[data-quote]");
    const src  = card.querySelector("[data-src]");
    const link = card.querySelector("[data-link]");

    if (qt)  qt.textContent = `“${item?.q || "—"}”`;
    if (src) src.textContent = item?.src || "Satoshi";
    if (link) {
      const u = item?.url || "https://nakamotoinstitute.org/quotes/";
      link.href = u;
      link.textContent = "source";
    }
  }

  async function updateQuoteOnce() {
    if (!mounted()) return;
    if (!byId("btc-satoshiquote")) return;

    if (!__quotes) __quotes = await loadQuotesList();
    if (!Array.isArray(__quotes) || !__quotes.length) __quotes = QUOTES_FALLBACK;

    const pick = __quotes[Math.floor(Math.random() * __quotes.length)];
    renderQuote(pick);
  }

  function startQuoteRotation() {
    if (__quoteTimer) return; // already running
    updateQuoteOnce();
    __quoteTimer = setInterval(() => {
      // if widget is removed, stop cleanly
      if (!byId("btc-satoshiquote") || !mounted()) { clearInterval(__quoteTimer); __quoteTimer = null; return; }
      updateQuoteOnce();
    }, 45_000);
  }

  // ----- scheduling -----
  let tSpot = null, t24 = null, tStats = null, tNews = null;

  function start() {
    if (tSpot) return; // already running

    updateSpot();
    update24h();
    updateHashrate();
    updateNodecount();
    updateLN();
    updateNews();
    startQuoteRotation();

    tSpot  = setInterval(updateSpot, 250);
    t24    = setInterval(update24h, 10_000);
    tStats = setInterval(() => { updateHashrate(); updateNodecount(); updateLN(); }, 15_000);
    tNews  = setInterval(updateNews, 60_000);
  }

  start();
})();
