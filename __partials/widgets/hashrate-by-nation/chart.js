// __partials/widgets/hashrate-by-nation/chart.js
(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationChart =
    window.ZZXHashrateNationChart || {});

  NS.draw = function(svg, rows){
    if (!svg) return;
    svg.innerHTML = "";

    rows.forEach(r=>{
      const bar = document.createElementNS("http://www.w3.org/2000/svg","rect");
      bar.setAttribute("x", r.x);
      bar.setAttribute("y", r.y);
      bar.setAttribute("width", r.w);
      bar.setAttribute("height", r.h);
      bar.setAttribute("class","zzx-hbn-bar");

      const label = document.createElementNS("http://www.w3.org/2000/svg","text");
      label.setAttribute("x", 4);
      label.setAttribute("y", r.y + 10);
      label.setAttribute("class","zzx-hbn-label");
      label.textContent = `${r.iso} ${r.hashrateZH.toFixed(1)} ZH/s`;

      svg.appendChild(bar);
      svg.appendChild(label);
    });
  };
})();
