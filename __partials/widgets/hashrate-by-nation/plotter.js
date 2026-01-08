// __partials/widgets/hashrate-by-nation/plotter.js
(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationPlotter =
    window.ZZXHashrateNationPlotter || {});

  NS.layout = function(data){
    const max = Math.max(...data.map(d=>d.hashrateZH));
    return data.map((d,i)=>({
      ...d,
      x: 10,
      y: 10 + i*18,
      w: (d.hashrateZH / max) * 260,
      h: 12
    }));
  };
})();
