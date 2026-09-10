// __partials/widgets/nodes-by-city/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodesByCityUI?.__version||0)>=4)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function textCell(value,className=""){
    const cell=D.createElement("div");
    cell.setAttribute("role","cell");
    if(className)cell.className=className;
    cell.textContent=value||"—";
    return cell;
  }

  function nationCell(item){
    const outer=D.createElement("div");
    outer.setAttribute("role","cell");

    const wrap=D.createElement("div");
    wrap.className="nodes-by-city__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-city__flag";
    flag.textContent=item.flag||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="nodes-by-city__nation-name";
    name.textContent=item.countryName||item.country||"Unknown";

    const iso=D.createElement("span");
    iso.className="nodes-by-city__iso";
    iso.textContent=item.country||"--";

    wrap.append(flag,name,iso);
    wrap.title=`${item.flag||""} ${name.textContent} · ${iso.textContent}`.trim();
    outer.appendChild(wrap);
    return outer;
  }

  function numeric(value){
    const cell=D.createElement("div");
    cell.className="nodes-by-city__num";
    cell.setAttribute("role","cell");
    cell.textContent=value;
    return cell;
  }

  function renderRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-city__empty";
      empty.textContent="No city records match this filter.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes-by-city__row";
      row.setAttribute("role","row");

      const rank=textCell(String(index+1));
      const city=textCell(item.city,"nodes-by-city__city");
      city.title=item.label;

      const region=textCell(item.region||"—","nodes-by-city__region");
      region.title=item.region||"Region unavailable";

      row.append(
        rank,
        city,
        region,
        nationCell(item),
        numeric(integer(item.nodes)),
        numeric(pct(item.share)),
        numeric(pct(item.geoShare))
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
      empty.className="nodes-by-city__empty";
      empty.textContent="No city leaders available.";
      container.appendChild(empty);
      return;
    }

    const max=Math.max(...leaders.map(row=>Number(row.nodes)||0),1);
    const fragment=D.createDocumentFragment();

    for(const item of leaders){
      const row=D.createElement("div");
      row.className="nodes-by-city__leader";

      const place=D.createElement("div");
      place.className="nodes-by-city__leader-place";

      const city=D.createElement("strong");
      city.textContent=item.city;

      const detail=D.createElement("span");
      detail.textContent=` · ${item.region?`${item.region} · `:""}${item.flag||"🏴"} ${item.countryName} · ${item.country}`;

      place.append(city,detail);
      place.title=item.label;

      const track=D.createElement("div");
      track.className="nodes-by-city__leader-track";

      const bar=D.createElement("i");
      bar.style.width=`${Math.max(0,Math.min(100,(item.nodes/max)*100)).toFixed(2)}%`;
      track.appendChild(bar);

      const value=D.createElement("div");
      value.className="nodes-by-city__leader-value";
      value.textContent=`${integer(item.nodes)} · ${pct(item.share)}`;

      row.append(place,track,value);
      fragment.appendChild(row);
    }

    container.appendChild(fragment);
  }

  W.ZZXNodesByCityUI=Object.freeze({
    __version:4,
    renderRows,
    renderLeaders
  });
})();
