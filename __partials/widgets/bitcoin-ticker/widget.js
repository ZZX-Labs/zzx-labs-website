// __partials/widgets/bitcoin-ticker/widget.js
// ZZX-Labs Bitcoin Ticker
// Uses local static Global BPI API first:
// /bitcoin/bpi/api/latest.json
// Compatible with ZZXWidgetsCore.onMount(), ZZXAPI.register(), and legacy ZZXWidgets.register().

(function () {
  "use strict";

  const W = window;
  const ID = "bitcoin-ticker";
  const API_URL = "/bitcoin/bpi/api/latest.json";
  const REFRESH_MS = 60000;

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

  function formatMoney(n) {
    if (W.ZZXAPI && typeof W.ZZXAPI.money === "function") {
      return W.ZZXAPI.money(n, "USD");
    }

    return "$" + Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatInt(n) {
    if (W.ZZXAPI && typeof W.ZZXAPI.int === "function") {
      return W.ZZXAPI.int(n);
    }

    return Number(n || 0).toLocaleString("en-US");
  }

  async function fetchJSON(core, url) {
    if (core && typeof core.fetchJSON === "function") {
      return await core.fetchJSON(url);
    }

    if (W.ZZXAPI && typeof W.ZZXAPI.json === "function") {
      return await W.ZZXAPI.json(url, {});
    }

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  }

  async function draw(root, core) {
    if (!root) return;

    try {
      const d = await fetchJSON(core, API_URL);

      const price = Number(d.price_usd || d.btc_usd || d.price || 0);
      const volume = Number(d.volume_24h_btc || d.volume_btc_24h || d.volume || 0);
      const sourceCount =
        Number(
          (d.weighted_average && d.weighted_average.sources) ||
          d.sources ||
          d.exchange_count ||
          0
        );

      const high = Number(d.high_24h || d.high_24h_usd || 0);
      const low = Number(d.low_24h || d.low_24h_usd || 0);

      root.innerHTML = `
        <section class="zzx-widget-card bitcoin-ticker-widget">
          <header class="zzx-widget-header">
            <span class="zzx-widget-title">BTC / Global BPI</span>
            <span class="zzx-widget-status">VWAP</span>
          </header>

          <div class="zzx-widget-primary" data-btc>
            ${formatMoney(price)}
          </div>

          <div class="zzx-widget-grid ticker-denoms">
            <div><span>mBTC</span><strong data-mbtc>${formatMoney(price * 1e-3)}</strong></div>
            <div><span>μBTC</span><strong data-ubtc>${formatMoney(price * 1e-6)}</strong></div>
            <div><span>sat</span><strong data-sat>${formatMoney(price * 1e-8)}</strong></div>
          </div>

          <footer class="zzx-widget-foot">
            ${formatInt(volume)} BTC 24h volume · ${formatInt(sourceCount)} exchanges
            ${high && low ? ` · H/L ${formatMoney(high)} / ${formatMoney(low)}` : ""}
          </footer>
        </section>
      `;
    } catch (_) {
      if (!root.__zzxTickerHadGoodDraw) {
        root.innerHTML = `
          <section class="zzx-widget-card bitcoin-ticker-widget">
            <header class="zzx-widget-header">
              <span class="zzx-widget-title">BTC / Global BPI</span>
              <span class="zzx-widget-status">offline</span>
            </header>
            <div class="zzx-widget-primary">Awaiting BPI snapshot</div>
            <footer class="zzx-widget-foot">/bitcoin/bpi/api/latest.json</footer>
          </section>
        `;
      }
      return;
    }

    root.__zzxTickerHadGoodDraw = true;
  }

  function boot(root, core) {
    if (!root) return;

    if (root.__zzxTickerTimer) {
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    draw(root, core);
    root.__zzxTickerTimer = setInterval(function () {
      draw(root, core);
    }, REFRESH_MS);
  }

  function mount(root, core) {
    loadShared(function () {
      boot(root, core || W.ZZXWidgetsCore || null);
    });
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, mount);
    return;
  }

  if (W.ZZXAPI && typeof W.ZZXAPI.register === "function") {
    W.ZZXAPI.register(ID, function (root, core) {
      mount(root, core);
    });
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, core) {
      mount(root, core);
    });
  }
})();
