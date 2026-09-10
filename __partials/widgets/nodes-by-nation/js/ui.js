// __partials/widgets/nodes-by-nation/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodesByNationUI?.__version||0)>=4)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function nationCell(item){
    const outer=D.createElement("div");
    outer.setAttribute("role","cell");

    const wrap=D.createElement("div");
    wrap.className="nodes-by-nation__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-nation__flag";
    flag.textContent=item.flag||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="nodes-by-nation__name";
    name.textContent=item.name||item.code||"Unknown";

    const iso=D.createElement("span");
    iso.className="nodes-by-nation__iso";
    iso.textContent=item.code||"--";

    wrap.append(flag,name,iso);
    wrap.title=`${item.flag||""} ${name.textContent} · ${iso.textContent}`.trim();
    outer.appendChild(wrap);
    return outer;
  }

  function renderRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-nation__empty";
      empty.textContent="No nation records match this filter.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes-by-nation__row";
      row.setAttribute("role","row");

      const rank=D.createElement("div");
      rank.setAttribute("role","cell");
      rank.textContent=String(index+1);

      const nodes=D.createElement("div");
      nodes.className="nodes-by-nation__num";
      nodes.setAttribute("role","cell");
      nodes.textContent=integer(item.nodes);

      const share=D.createElement("div");
      share.className="nodes-by-nation__num";
      share.setAttribute("role","cell");
      share.textContent=pct(item.share);

      const geoShare=D.createElement("div");
      geoShare.className="nodes-by-nation__num";
      geoShare.setAttribute("role","cell");
      geoShare.textContent=pct(item.geoShare);

      row.append(
        rank,
        nationCell(item),
        nodes,
        share,
        geoShare
      );

      fragment.appendChild(row);
    });

    body.appendChild(fragment);
  }

  function renderLeaders(container,rows){
    container.replaceChildren();

    const leaders=(rows||[]).slice(0,5);

    if(!leaders.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-nation__empty";
      empty.textContent="No geolocated nation leaders available.";
      container.appendChild(empty);
      return;
    }

    const max=Math.max(...leaders.map(row=>Number(row.nodes)||0),1);
    const fragment=D.createDocumentFragment();

    for(const item of leaders){
      const row=D.createElement("div");
      row.className="nodes-by-nation__leader";

      const name=D.createElement("div");
      name.className="nodes-by-nation__leader-name";

      const flag=D.createElement("span");
      flag.textContent=item.flag||"🏴";

      const label=D.createElement("span");
      label.textContent=item.name;
      label.title=item.name;

      const iso=D.createElement("strong");
      iso.textContent=item.code;

      name.append(flag,label,iso);

      const track=D.createElement("div");
      track.className="nodes-by-nation__leader-track";

      const bar=D.createElement("i");
      bar.style.width=`${Math.max(0,Math.min(100,(item.nodes/max)*100)).toFixed(2)}%`;
      track.appendChild(bar);

      const value=D.createElement("div");
      value.className="nodes-by-nation__leader-value";
      value.textContent=`${integer(item.nodes)} · ${pct(item.share)}`;

      row.append(name,track,value);
      fragment.appendChild(row);
    }

    container.appendChild(fragment);
  }

  W.ZZXNodesByNationUI=Object.freeze({
    __version:4,
    renderRows,
    renderLeaders
  });
})();
