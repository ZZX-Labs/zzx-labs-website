// __partials/widgets/knots-vs-core/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXKnotsCoreUI?.__version||0)>=6)return;

  function text(value){return String(value??"").trim();}
  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }
  function percent(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function cell(value,{numeric=false,className="",title=""}={}){
    const el=D.createElement("div");
    el.setAttribute("role","cell");
    if(numeric)el.classList.add("knots-vs-core__num");
    if(className)el.classList.add(className);
    el.textContent=value==null?"—":String(value);
    if(title)el.title=title;
    return el;
  }

  function nationCell(item){
    const wrap=D.createElement("div");
    wrap.className="knots-vs-core__nation";
    wrap.setAttribute("role","cell");

    const flag=D.createElement("span");
    flag.className="knots-vs-core__flag";
    flag.textContent=text(item?.flag)||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="knots-vs-core__country-name";
    name.textContent=text(item?.countryName)||"Unlocated";

    const code=D.createElement("span");
    code.className="knots-vs-core__country-code";
    code.textContent=text(item?.country)||"--";

    wrap.append(flag,name,code);
    wrap.title=`${name.textContent} · ${code.textContent}`;
    return wrap;
  }

  function familyCell(item){
    const outer=D.createElement("div");
    outer.setAttribute("role","cell");

    const badge=D.createElement("span");
    badge.className="knots-vs-core__family";
    badge.textContent=item?.family==="Bitcoin Knots"?"Knots":"Core";

    outer.appendChild(badge);
    return outer;
  }

  function renderNationRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="knots-vs-core__empty";
      empty.textContent="No nation-tagged client rows are available.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="knots-vs-core__nation-row";
      row.setAttribute("role","row");
      row.append(
        nationCell(item),
        cell(integer(item.core),{numeric:true}),
        cell(integer(item.knots),{numeric:true}),
        cell(integer(item.other),{numeric:true}),
        cell(integer(item.total),{numeric:true})
      );
      fragment.appendChild(row);
    }

    body.appendChild(fragment);
  }

  function renderVersionRows(body,rows){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="knots-vs-core__empty";
      empty.textContent="No Core/Knots version rows match this filter.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="knots-vs-core__version-row";
      row.setAttribute("role","row");
      row.dataset.family=item.family;

      const uaTitle=[
        item.family,
        item.version,
        item.userAgent,
        item.nationLabel||item.countryName||"Unlocated"
      ].filter(Boolean).join(" · ");

      row.append(
        familyCell(item),
        cell(item.userAgent||item.version||"Unknown",{
          className:"knots-vs-core__ua",
          title:uaTitle
        }),
        nationCell(item),
        cell(integer(item.count),{numeric:true}),
        cell(percent(item.shareIdentified),{numeric:true})
      );

      fragment.appendChild(row);
    }

    body.appendChild(fragment);
  }

  W.ZZXKnotsCoreUI=Object.freeze({
    __version:6,
    renderNationRows,
    renderVersionRows
  });
})();
