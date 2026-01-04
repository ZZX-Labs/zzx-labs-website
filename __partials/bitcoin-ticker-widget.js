// __partials/bitcoin-ticker-widget.js (WIDGET HOST v1)
(function () {
  if (window.__ZZX_WIDGET_HOST_V1) return;
  window.__ZZX_WIDGET_HOST_V1 = true;

  const HOST = {
    base: "/__partials/widgets",
    cssLoaded: new Set(),
    jsLoaded: new Set(),
    reg: new Map(),
    running: new Map(),
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Shared API endpoints + helpers for every widget
  const ctx = {
    api: {
      MEMPOOL: "https://mempool.space/api",
      COINBASE_SPOT: "https://api.coinbase.com/v2/prices/spot?currency=USD",
      COINBASE_CANDLES_15M: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900",
      ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
      BITNODES_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
      BITNODES_COUNTRIES: "https://bitnodes.io/api/v1/nodes/countries/",
      GH: "https://api.github.com",
      HN_QUERY: "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story",
    },
    util: {
      fmtUSD: (n) => Number.isFinite(n) ? n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "—",
      fmtBig: (n) => {
        if (!Number.isFinite(n)) return "—";
        const abs = Math.abs(n), sign = n < 0 ? "-" : "";
        if (abs >= 1e12) return sign + (abs/1e12).toFixed(2) + "T";
        if (abs >= 1e9)  return sign + (abs/1e9).toFixed(2)  + "B";
        if (abs >= 1e6)  return sign + (abs/1e6).toFixed(2)  + "M";
        if (abs >= 1e3)  return sign + (abs/1e3).toFixed(2)  + "K";
        return sign + abs.toFixed(2);
      },
      jget: async (url, opts) => {
        const r = await fetch(url, { cache: "no-store", ...opts });
        if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
        return await r.json();
      },
      tget: async (url, opts) => {
        const r = await fetch(url, { cache: "no-store", ...opts });
        if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
        return await r.text();
      },
      jgetAllOrigins: async (targetUrl) => {
        const ao = ctx.api.ALLORIGINS_RAW + encodeURIComponent(targetUrl);
        const r = await fetch(ao, { cache: "no-store" });
        if (!r.ok) throw new Error(`AllOrigins HTTP ${r.status}`);
        return await r.json();
      },
      setCard: (cardEl, valueText, subText) => {
        if (!cardEl) return;
        const v = cardEl.querySelector("[data-val]");
        const s = cardEl.querySelector("[data-sub]");
        if (v) v.textContent = (valueText ?? "—");
        if (s && subText != null) s.textContent = subText;
      },
      // small sparkline helper (SVG inside card)
      ensureSpark: (cardEl) => {
        if (!cardEl) return null;
        let svg = cardEl.querySelector(".btc-spark");
        if (svg) return svg;

        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("btc-spark");
        svg.setAttribute("viewBox", "0 0 240 38");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML = `
          <path class="grid" d="M0 19 H240"></path>
          <path class="fill" d=""></path>
          <path class="line" d=""></path>
        `;
        cardEl.appendChild(svg);
        return svg;
      },
      drawSpark: (cardEl, series) => {
        const svg = ctx.util.ensureSpark(cardEl);
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
    }
  };

  // Registry exposed to widget modules
  window.ZZXWidgets = window.ZZXWidgets || {};
  window.ZZXWidgets.register = function (slug, impl) {
    HOST.reg.set(slug, impl);
  };

  function ensureCSSOnce(href) {
    if (HOST.cssLoaded.has(href)) return;
    HOST.cssLoaded.add(href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  async function ensureJSOnce(src) {
    if (HOST.jsLoaded.has(src)) return;
    HOST.jsLoaded.add(src);
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadHTML(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  async function mountWidget(slug, slotEl) {
    const base = `${HOST.base}/${slug}`;

    // 1) css (optional but expected)
    ensureCSSOnce(`${base}/widget.css`);

    // 2) html
    const html = await loadHTML(`${base}/widget.html`);
    slotEl.innerHTML = html;

    // 3) js
    await ensureJSOnce(`${base}/widget.js`);

    // 4) run
    const impl = HOST.reg.get(slug);
    if (!impl) throw new Error(`Widget "${slug}" did not register`);

    // stop existing if re-mounted
    try {
      const running = HOST.running.get(slug);
      if (running?.stop) running.stop(ctx);
    } catch {}

    // mount/start
    try { impl.mount?.(slotEl, ctx); } catch {}
    try { impl.start?.(ctx); } catch {}

    HOST.running.set(slug, impl);
  }

  async function boot() {
    const rail = $("#btc-rail");
    if (!rail) return;

    const slots = $$("[data-widget]", rail);
    for (const slot of slots) {
      const slug = slot.getAttribute("data-widget");
      if (!slug) continue;
      try {
        await mountWidget(slug, slot);
      } catch (e) {
        slot.innerHTML = `
          <div class="btc-card">
            <div class="btc-card__title">${slug}</div>
            <div class="btc-card__value">—</div>
            <div class="btc-card__sub">widget load error</div>
          </div>`;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
