// __partials/widgets/bitcoin-ticker/widget.js

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const API_URL = "/bitcoin/bpi/api/latest.json";
  const REFRESH_MS = 60000;

  const FALLBACKS = [
    {
      name: "coinbase",
      url: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      parse: d => Number(d && d.data && d.data.amount)
    },
    {
      name: "kraken",
      url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      parse: d => Number(d && d.result && d.result.XXBTZUSD && d.result.XXBTZUSD.c && d.result.XXBTZUSD.c[0])
    },
    {
      name: "gemini",
      url: "https://api.gemini.com/v1/pubticker/btcusd",
      parse: d => Number(d && d.last)
    },
    {
      name: "bitstamp",
      url: "https://www.bitstamp.net/api/v2/ticker/btcusd/",
      parse: d => Number(d && d.last)
    },
    {
      name: "bitfinex",
      url: "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",
      parse: d => Array.isArray(d) ? Number(d[6]) : NaN
    }
  ];

  function loadShared(cb) {
    if (W.ZZXAPI) return cb();

    const existing = document.querySelector('script[data-zzx-api-loader="1"]');
    if (existing) {
      existing.addEventListener("load", cb, { once: true });
      return;
    }

    const s = document.createElement("script");
    s.src = "/__partials/widgets/_shared/zzx-api.js";
    s.dataset.zzxApiLoader = "1";
    s.onload = cb;
    document.head.appendChild(s);
  }

  async function rawJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  }

  async function fetchJSON(core, url) {
    if (core && typeof core.fetchJSON === "function") return await core.fetchJSON(url);
    if (W.ZZXAPI && typeof W.ZZXAPI.json === "function") return await W.ZZXAPI.json(url, {});
    return await rawJSON(url);
  }

  async function fallbackSpot() {
    for (const src of FALLBACKS) {
      try {
        const d = await rawJSON(src.url);
        const price = src.parse(d);
        if (Number.isFinite(price) && price > 0) {
          return {
            price_usd: price,
            volume_24h_btc: 0,
            high_24h: 0,
            low_24h: 0,
            exchange_count: 1,
            weighted_average: { sources: 1 },
            source: src.name,
            mode: "fallback"
          };
        }
      } catch (_) {}
    }

    throw new Error("All BTC ticker sources failed");
  }

  async function loadTickerData(core) {
    try {
      const d = await fetchJSON(core, API_URL);
      const price = Number(d.price_usd || d.btc_usd || d.price || 0);
      if (Number.isFinite(price) && price > 0) {
        d.mode = d.mode || "zzx-bpi";
        d.source = d.source || "zzx-global-bpi";
        return d;
      }
    } catch (_) {}

    return await fallbackSpot();
  }

  function money(n, digits) {
    return Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function int(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  async function draw(root, core) {
    if (!root) return;

    try {
      const d = await loadTickerData(core);

      const price = Number(d.price_usd || d.btc_usd || d.price || 0);
      const volume = Number(d.volume_24h_btc || d.volume_btc_24h || d.volume || 0);
      const sourceCount = Number(
        (d.weighted_average && d.weighted_average.sources) ||
        d.sources ||
        d.exchange_count ||
        0
      );

      const high = Number(d.high_24h || d.high_24h_usd || 0);
      const low = Number(d.low_24h || d.low_24h_usd || 0);
      const mode = d.mode === "fallback" ? `fallback:${d.source}` : "VWAP";

      root.innerHTML = `
        <section class="zzx-widget-card bitcoin-ticker-widget">
          <header class="zzx-widget-header">
            <span class="zzx-widget-title">BTC / Global BPI</span>
            <span class="zzx-widget-status">${mode}</span>
          </header>

          <div class="zzx-widget-primary">
            $${money(price, 2)}
          </div>

          <div class="zzx-widget-grid ticker-denoms">
            <div><span>mBTC</span><strong>$${money(price * 1e-3, 2)}</strong></div>
            <div><span>μBTC</span><strong>$${money(price * 1e-6, 4)}</strong></div>
            <div><span>sat</span><strong>$${money(price * 1e-8, 6)}</strong></div>
          </div>

          <footer class="zzx-widget-foot">
            ${volume ? `${int(volume)} BTC 24h volume · ` : ""}
            ${sourceCount ? `${int(sourceCount)} exchanges · ` : ""}
            ${high && low ? `H/L $${money(high, 2)} / $${money(low, 2)} · ` : ""}
            ${d.source || "zzx-global-bpi"}
          </footer>
        </section>
      `;

      root.__zzxTickerHadGoodDraw = true;
    } catch (_) {
      if (!root.__zzxTickerHadGoodDraw) {
        root.innerHTML = `
          <section class="zzx-widget-card bitcoin-ticker-widget">
            <header class="zzx-widget-header">
              <span class="zzx-widget-title">BTC / Global BPI</span>
              <span class="zzx-widget-status">offline</span>
            </header>
            <div class="zzx-widget-primary">Awaiting BPI snapshot</div>
            <footer class="zzx-widget-foot">Local BPI and fallback exchanges unavailable.</footer>
          </section>
        `;
      }
    }
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxTickerTimer) {
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    draw(root, core);
    root.__zzxTickerTimer = setInterval(() => draw(root, core), REFRESH_MS);
  }

  function mount(root, core) {
    loadShared(() => boot(root, core || W.ZZXWidgetsCore || null));
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, mount);
    return;
  }

  if (W.ZZXAPI && typeof W.ZZXAPI.register === "function") {
    W.ZZXAPI.register(ID, mount);
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, mount);
  }
})();
