// __partials/bitcoin-ticker-widget.js
// Multi-widget updater. Safe if fragment is missing or re-injected.
// Loaded once per page by ticker-loader.js.

(function () {
  // ---- guards ----
  if (window.__ZZX_BTC_WIDGETS_STARTED) return;
  window.__ZZX_BTC_WIDGETS_STARTED = true;

  const $ = (sel, root = document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function mounted() {
    return !!byId("btc-value"); // primary span exists => fragment present
  }

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

  // ---- formatting ----
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

  // ---- 1) Spot ticker (Coinbase) ----
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
    } catch {}
  }

  // ---- 2) 24h price + volume (Coinbase Exchange stats) ----
  const STATS_24H = "https://api.exchange.coinbase.com/products/BTC-USD/stats";

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

      const volUSD = (Number.isFinite(vol) && Number.isFinite(last)) ? vol * last : NaN;
      setCard("btc-24hvolume", fmtBig(volUSD), "USD");
    } catch {
      setCard("btc-24hprice", "—", "—");
      setCard("btc-24hvolume", "—", "USD");
    }
  }

  // ---- 3) Network stats (best-effort public, otherwise stays —) ----
  // If you later add your own API:
  //   /api/btc/hashrate, /api/btc/nodecount, /api/btc/lightning
  // just swap the URLs below.

  async function updateHashrate() {
    if (!mounted()) return;
    try {
      // best-effort: mempool (may or may not allow CORS in your deployment)
      // If blocked, it will fall back to "—".
      const j = await jget("https://mempool.space/api/v1/mining/hashrate/1d");
      // mempool returns an array; take last datapoint; value is H/s
      const arr = Array.isArray(j) ? j : [];
      const last = arr.length ? arr[arr.length - 1] : null;
      const hs = last && typeof last.hashrate === "number" ? last.hashrate : NaN;
      const ehs = Number.isFinite(hs) ? (hs / 1e18) : NaN; // H/s -> EH/s
      setCard("btc-hashrate", Number.isFinite(ehs) ? ehs.toFixed(2) : "—", "EH/s");
    } catch {
      setCard("btc-hashrate", "—", "EH/s");
    }
  }

  async function updateNodecount() {
    if (!mounted()) return;
    try {
      // best-effort: bitnodes (CORS may block)
      const j = await jget("https://bitnodes.io/api/v1/snapshots/latest/");
      const n = j && j.total_nodes ? Number(j.total_nodes) : NaN;
      setCard("btc-nodecount", Number.isFinite(n) ? fmtBig(n) : "—", "reachable");
    } catch {
      setCard("btc-nodecount", "—", "reachable");
    }
  }

  async function updateLN() {
    if (!mounted()) return;
    try {
      // best-effort: mempool LN stats (CORS may block)
      const j = await jget("https://mempool.space/api/v1/lightning/statistics/latest");
      const cap = j && typeof j.capacity_btc === "number" ? j.capacity_btc : NaN;
      setCard("btc-lnstats", Number.isFinite(cap) ? cap.toFixed(0) : "—", "capacity (BTC)");
    } catch {
      setCard("btc-lnstats", "—", "capacity");
    }
  }

  // ---- 4) Newsfeed (stopgap: HN search; proper version uses your backend) ----
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

    // Preferred later:
    // const url = "/api/news?keywords=bitcoin,satoshi%20nakamoto,hal%20finney,bip,lightning,lnd";
    // try { renderNews(await jget(url)); return; } catch {}

    try {
      const data = await jget(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const items = hits.map(h => ({
        source: "HN",
        title: h.title || h.story_title || "—",
        url: h.url || h.story_url || "#",
      }));
      renderNews(items);
    } catch {
      renderNews([]);
    }
  }

  // ---- 5) Satoshi quote rotation (local JSON preferred) ----
  const QUOTES_FALLBACK = [
    {
      q: "The root problem with conventional currency is all the trust that's required to make it work.",
      src: "Satoshi (2009)",
      url: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source"
    },
    {
      q: "I'm sure that in 20 years there will either be very large transaction volume or no volume.",
      src: "Satoshi (quote)",
      url: "https://nakamotoinstitute.org/quotes/"
    },
    {
      q: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.",
      src: "Satoshi (2010)",
      url: "https://nakamotoinstitute.org/quotes/"
    },
    {
      q: "It might make sense just to get some in case it catches on.",
      src: "Satoshi (quote)",
      url: "https://nakamotoinstitute.org/quotes/"
    }
  ];

  const QUOTES_JSON = "/static/data/satoshi-quotes.json";
  let QUOTES = null;

  async function loadQuotes() {
    try {
      const r = await fetch(QUOTES_JSON, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && j.length) return j;
      }
    } catch {}
    return QUOTES_FALLBACK;
  }

  function renderQuote(item) {
    const card = byId("btc-satoshiquote");
    if (!card) return;

    const qt = card.querySelector("[data-quote]");
    const src = card.querySelector("[data-src]");
    const link = card.querySelector("[data-link]");

    if (qt)  qt.textContent = `“${item.q || "—"}”`;
    if (src) src.textContent = item.src || "Satoshi";
    if (link) {
      link.href = item.url || "https://nakamotoinstitute.org/quotes/";
    }
  }

  async function updateQuote() {
    if (!mounted()) return;
    if (!QUOTES) QUOTES = await loadQuotes();
    const pick = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    renderQuote(pick);
  }

  // ---- scheduler ----
  function startWhenMounted() {
    // If fragment isn't in DOM yet, wait without breaking anything.
    if (!mounted()) {
      setTimeout(startWhenMounted, 80);
      return;
    }

    // First paint
    updateSpot();
    update24h();
    updateHashrate();
    updateNodecount();
    updateLN();
    updateNews();
    updateQuote();

    // Timers
    setInterval(updateSpot, 250);
    setInterval(update24h, 10_000);
    setInterval(() => { updateHashrate(); updateNodecount(); updateLN(); }, 15_000);
    setInterval(updateNews, 60_000);
    setInterval(updateQuote, 45_000);
  }

  startWhenMounted();
})();
