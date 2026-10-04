// __partials/widgets/node-latency/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodeLatencyUI?.__version||0)>=2)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function ms(value){
    const n=Number(value);
    return Number.isFinite(n)?`${n.toFixed(1)} ms`:"—";
  }

  function renderNetworkRows(body,rows,mode){
    body.replaceChildren();

    if(mode!=="per-node"){
      const empty=D.createElement("div");
      empty.className="node-latency__empty";
      empty.textContent="Per-network latency requires per-node latencyMs telemetry; current snapshot exposes aggregate percentiles only.";
      body.appendChild(empty);
      return;
    }

    const visible=(rows||[]).filter(row=>row.sampleCount>0);

    if(!visible.length){
      const empty=D.createElement("div");
      empty.className="node-latency__empty";
      empty.textContent="No per-network latency samples are available.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    for(const item of visible){
      const row=D.createElement("div");
      row.className="node-latency__row";
      row.setAttribute("role","row");

      const network=D.createElement("div");
      const badge=D.createElement("span");
      badge.className="node-latency__network";
      badge.textContent=item.network;
      network.appendChild(badge);

      row.appendChild(network);

      for(const value of [
        integer(item.nodes),
        integer(item.sampleCount),
        pct(item.coverage),
        ms(item.p50),
        ms(item.avg),
        ms(item.p95)
      ]){
        const cell=D.createElement("div");
        cell.className="node-latency__num";
        cell.setAttribute("role","cell");
        cell.textContent=value;
        row.appendChild(cell);
      }

      fragment.appendChild(row);
    }

    body.appendChild(fragment);
  }

  W.ZZXNodeLatencyUI=Object.freeze({
    __version:2,
    renderNetworkRows
  });
})();
