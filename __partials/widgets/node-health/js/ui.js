// __partials/widgets/node-health/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodeHealthUI?.__version||0)>=2)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function renderNetworkRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="node-health__empty";
      empty.textContent="No normalized network rows available.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="node-health__row";
      row.setAttribute("role","row");

      const network=D.createElement("div");
      const badge=D.createElement("span");
      badge.className="node-health__network";
      badge.textContent=item.network;
      network.appendChild(badge);

      const values=[
        integer(item.nodes),
        integer(item.heightKnown),
        integer(item.synced),
        integer(item.behind),
        pct(item.syncShare)
      ];

      row.appendChild(network);

      for(const value of values){
        const cell=D.createElement("div");
        cell.className="node-health__num";
        cell.setAttribute("role","cell");
        cell.textContent=value;
        row.appendChild(cell);
      }

      fragment.appendChild(row);
    }

    body.appendChild(fragment);
  }

  W.ZZXNodeHealthUI=Object.freeze({
    __version:2,
    renderNetworkRows
  });
})();
