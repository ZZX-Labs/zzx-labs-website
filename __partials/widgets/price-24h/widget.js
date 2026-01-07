// price-24/widget.js
// Mirrors volume-24 behavior: value + % change + spark area
// NO runtime.js, NO new globals

(function () {
  "use strict";

  const W = window;

  function boot(root, core){
    if (!root) return;

    const priceEl  = root.querySelector("[data-price]");
    const changeEl = root.querySelector("[data-change]");
    const canvas   = root.querySelector("[data-spark]");
    if (!priceEl || !changeEl || !canvas) return;

    const ctx = canvas.getContext("2d");

    // Prefer core fetch (volume-24 already relies on this pattern)
    const fetchJSON = core?.fetchJSON
      ? (u) => core.fetchJSON(u)
      : async (u) => (await fetch(u, { cache:"no-store" })).json();

    // Coinbase 24h candles (no new route, public endpoint)
    const API =
      "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900";

    async function tick(){
      try{
        const rows = await fetchJSON(API);
        if (!Array.isArray(rows) || rows.length < 2) return;

        // candles: [ time, low, high, open, close, volume ]
        const closes = rows.map(r => r[4]).reverse();

        const first = closes[0];
        const last  = closes[closes.length - 1];

        priceEl.textContent = last.toFixed(2);

        const pct = ((last - first) / first) * 100;
        changeEl.textContent = pct.toFixed(2) + "%";
        changeEl.classList.toggle("pos", pct >= 0);
        changeEl.classList.toggle("neg", pct < 0);

        drawSpark(ctx, closes, pct >= 0);

      } catch (_) {
        /* keep last render */
      }
    }

    function drawSpark(ctx, data, up){
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.clearRect(0,0,w,h);

      const min = Math.min(...data);
      const max = Math.max(...data);
      const rng = max - min || 1;

      ctx.beginPath();
      data.forEach((v,i)=>{
        const x = (i/(data.length-1))*w;
        const y = h - ((v - min)/rng)*h;
        if(i===0) ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
      });

      ctx.strokeStyle = up ? "#4caf50" : "#e53935";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // area fill
      ctx.lineTo(w,h);
      ctx.lineTo(0,h);
      ctx.closePath();

      ctx.globalAlpha = .18;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    tick();
    root.__price24Timer = setInterval(tick, 30_000);
  }

  // Core lifecycle
  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount("price-24", boot);
  } else if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register("price-24", boot);
  }
})();
