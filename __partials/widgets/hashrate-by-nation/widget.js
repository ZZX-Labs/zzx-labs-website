// __partials/widgets/hashrate-by-nation/widget.js
(function(){
  "use strict";

  const ID = "hashrate-by-nation";

  async function boot(root){
    const sub = root.querySelector("[data-hbn-sub]");
    const svg = root.querySelector("[data-hbn-svg]");

    try{
      const { pools24h, hashrate } =
        window.ZZXHashrateNationSources.endpoints;

      const pools = await window.ZZXHashrateNationFetch.fetch(pools24h);
      const hr = await window.ZZXHashrateNationFetch.fetch(hashrate);

      const latestHR = hr.at(-1)?.hashrate || hr.at(-1)?.value;
      const globalZH = latestHR / 1e21;

      const nationAgg = {};

      pools.forEach(p=>{
        const iso = window.ZZXHashrateNationMap.mapPool(p.name);
        nationAgg[iso] = (nationAgg[iso] || 0) + p.blocks;
      });

      const totalBlocks = Object.values(nationAgg)
        .reduce((a,b)=>a+b,0);

      const rows = Object.entries(nationAgg)
        .map(([iso,blocks])=>({
          iso,
          blocks,
          hashrateZH: (blocks / totalBlocks) * globalZH
        }))
        .sort((a,b)=>b.hashrateZH - a.hashrateZH)
        .slice(0,8);

      const layout =
        window.ZZXHashrateNationPlotter.layout(rows);

      window.ZZXHashrateNationChart.draw(svg, layout);

      sub.textContent = "Source: mempool.space · heuristic mapping";
    }catch(e){
      sub.textContent = "error loading data";
    }
  }

  if (window.ZZXWidgetsCore?.onMount){
    window.ZZXWidgetsCore.onMount(ID, boot);
  } else if (window.ZZXWidgets?.register){
    window.ZZXWidgets.register(ID, root=>boot(root));
  }
})();
