// __partials/widgets/drift/widget.js
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const API = "https://mempool.space/api";
  let inflight = false;

  function mins(n) { return Number.isFinite(n) ? `${n.toFixed(1)}m` : "—"; }

  async function update(root) {
    if (inflight) return;
    inflight = true;
    try {
      const r = await fetch(`${API}/blocks`, { cache: "no-store" });
      if (!r.ok) throw new Error(`blocks HTTP ${r.status}`);
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) throw new Error("blocks empty");

      const tip = arr[0];
      const ts = Number(tip?.timestamp);
      if (!Number.isFinite(ts)) throw new Error("tip timestamp missing");

      const sinceMin = Math.max(0, (Date.now()/1000 - ts) / 60);
      root.querySelector("[data-since]").textContent = `+${mins(sinceMin)}`;

      // compute avg block interval (last 6)
      const N = 6;
      const tsList = arr.slice(0, N).map(b => Number(b?.timestamp)).filter(Number.isFinite);
      let avgMin = NaN;
      if (tsList.length >= 2) {
        const diffs = [];
        for (let i=0;i<tsList.length-1;i++) diffs.push(tsList[i] - tsList[i+1]);
        avgMin = (diffs.reduce((a,x)=>a+x,0)/diffs.length)/60;
      }
      const d10 = Number.isFinite(avgMin) ? (avgMin - 10) : NaN;
      root.querySelector("[data-sub]").textContent =
        Number.isFinite(avgMin) ? `avg:${avgMin.toFixed(1)}m Δ10:${d10>=0?"+":""}${d10.toFixed(1)}m` : "mempool.space";
    } catch (e) {
      root.querySelector("[data-sub]").textContent = `error: ${String(e?.message || e)}`;
    } finally {
      inflight = false;
    }
  }

  Core.onMount("drift", (root) => {
    update(root);
    setInterval(() => update(root), 15_000);
  });
})();
