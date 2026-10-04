// __partials/widgets/nodes-by-county/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodesByCountyUI?.__version||0)>=4)return;

  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function plainCell(value,className=""){
    const cell=D.createElement("div");
    cell.setAttribute("role","cell");
    if(className)cell.className=className;
    cell.textContent=value||"—";
    return cell;
  }

  function numeric(value){
    const cell=plainCell(value,"nodes-by-county__num");
    return cell;
  }

  function placeCell(name,code,className){
    const outer=D.createElement("div");
    outer.setAttribute("role","cell");

    const wrap=D.createElement("div");
    wrap.className=className;

    const label=D.createElement("span");
    label.className=className==="nodes-by-county__place"
      ? "nodes-by-county__place-name"
      : "nodes-by-county__region-name";
    label.textContent=name||"—";

    wrap.appendChild(label);

    if(code){
      const badge=D.createElement("span");
      badge.className="nodes-by-county__admin-code";
      badge.textContent=code;
      wrap.appendChild(badge);
    }

    outer.appendChild(wrap);
    return outer;
  }

  function nationCell(item){
    const outer=D.createElement("div");
    outer.setAttribute("role","cell");

    const wrap=D.createElement("div");
    wrap.className="nodes-by-county__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-county__flag";
    flag.textContent=item.flag||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="nodes-by-county__nation-name";
    name.textContent=item.countryName||item.country||"Unknown";

    const iso=D.createElement("span");
    iso.className="nodes-by-county__iso";
    iso.textContent=item.country||"--";

    wrap.append(flag,name,iso);
    wrap.title=`${item.flag||""} ${name.textContent} · ${iso.textContent}`.trim();
    outer.appendChild(wrap);
    return outer;
  }

  function renderRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-county__empty";
      empty.textContent="No county/admin-2 records match this filter.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes-by-county__row";
      row.setAttribute("role","row");

      const rank=plainCell(String(index+1));
      const county=placeCell(
        item.county,
        item.admin2Code,
        "nodes-by-county__place"
      );
      county.title=item.label;

      const region=placeCell(
        item.region||"—",
        item.admin1Code,
        "nodes-by-county__region"
      );
      region.title=item.region||"Region unavailable";

      row.append(
        rank,
        county,
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
      empty.className="nodes-by-county__empty";
      empty.textContent="No county/admin-2 leaders available.";
      container.appendChild(empty);
      return;
    }

    const max=Math.max(...leaders.map(row=>Number(row.nodes)||0),1);
    const fragment=D.createDocumentFragment();

    for(const item of leaders){
      const row=D.createElement("div");
      row.className="nodes-by-county__leader";

      const place=D.createElement("div");
      place.className="nodes-by-county__leader-place";

      const county=D.createElement("strong");
      county.textContent=item.county;

      const detail=D.createElement("span");
      detail.textContent=
        `${item.admin2Code?` · ${item.admin2Code}`:""}`+
        `${item.region?` · ${item.region}`:""}`+
        `${item.admin1Code?` · ${item.admin1Code}`:""}`+
        ` · ${item.flag||"🏴"} ${item.countryName} · ${item.country}`;

      place.append(county,detail);
      place.title=item.label;

      const track=D.createElement("div");
      track.className="nodes-by-county__leader-track";

      const bar=D.createElement("i");
      bar.style.width=`${Math.max(0,Math.min(100,(item.nodes/max)*100)).toFixed(2)}%`;
      track.appendChild(bar);

      const value=D.createElement("div");
      value.className="nodes-by-county__leader-value";
      value.textContent=`${integer(item.nodes)} · ${pct(item.share)}`;

      row.append(place,track,value);
      fragment.appendChild(row);
    }

    container.appendChild(fragment);
  }

  W.ZZXNodesByCountyUI=Object.freeze({
    __version:4,
    renderRows,
    renderLeaders
  });
})();
