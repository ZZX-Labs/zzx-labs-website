// __partials/widgets/node-network-mix/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodeNetworkMixUI?.__version||0)>=2)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function label(network){
    const names={
      ipv4:"IPv4",
      ipv6:"IPv6",
      tor:"Tor",
      i2p:"I2P",
      cjdns:"CJDNS",
      other:"Other"
    };
    return names[network]||String(network||"Other");
  }

  function renderBars(container,rows){
    container.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="node-network-mix__empty";
      empty.textContent="No network distribution is available.";
      container.appendChild(empty);
      return;
    }

    const max=Math.max(...rows.map(row=>Number(row.nodes)||0),1);
    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="node-network-mix__bar";

      const left=D.createElement("div");
      left.className="node-network-mix__bar-label";

      const badge=D.createElement("span");
      badge.className="node-network-mix__badge";
      badge.textContent=label(item.network);
      left.appendChild(badge);

      const track=D.createElement("div");
      track.className="node-network-mix__bar-track";

      const bar=D.createElement("i");
      bar.style.width=`${Math.max(0,Math.min(100,(item.nodes/max)*100)).toFixed(2)}%`;
      track.appendChild(bar);

      const value=D.createElement("div");
      value.className="node-network-mix__bar-value";
      value.textContent=`${integer(item.nodes)} · ${pct(item.share)}`;

      row.append(left,track,value);
      fragment.appendChild(row);
    }

    container.appendChild(fragment);
  }

  function renderRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="node-network-mix__empty";
      empty.textContent="No normalized transport rows are available.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="node-network-mix__row";
      row.setAttribute("role","row");

      const network=D.createElement("div");
      const badge=D.createElement("span");
      badge.className="node-network-mix__badge";
      badge.textContent=label(item.network);
      network.appendChild(badge);

      const values=[
        integer(item.nodes),
        pct(item.share),
        String(item.rank)
      ];

      row.appendChild(network);

      for(const value of values){
        const cell=D.createElement("div");
        cell.className="node-network-mix__num";
        cell.setAttribute("role","cell");
        cell.textContent=value;
        row.appendChild(cell);
      }

      fragment.appendChild(row);
    }

    body.appendChild(fragment);
  }

  W.ZZXNodeNetworkMixUI=Object.freeze({
    __version:2,
    label,
    renderBars,
    renderRows
  });
})();
