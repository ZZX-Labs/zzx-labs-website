// __partials/widgets/nodes-by-version/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodesByVersionUI?.__version||0)>=3)return;

  function text(value){return String(value??"").trim();}
  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }
  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function cell({numeric=false,className=""}={}){
    const el=D.createElement("div");
    el.setAttribute("role","cell");
    if(numeric)el.classList.add("nodes-by-version__num");
    if(className)el.classList.add(className);
    return el;
  }

  function agentCell(item){
    const outer=cell();
    const wrap=D.createElement("div");
    wrap.className="nodes-by-version__agent";

    const version=D.createElement("span");
    version.className="nodes-by-version__version-chip";
    version.textContent=text(item.version)||"Unknown";
    version.title=`Parsed version: ${version.textContent}`;

    const ua=D.createElement("span");
    ua.className="nodes-by-version__ua";
    ua.textContent=text(item.userAgent)||"Unknown";
    ua.title=[
      text(item.userAgent)||"Unknown",
      text(item.family),
      `version ${text(item.version)||"Unknown"}`,
      text(item.nationLabel)||text(item.countryName)||"Unlocated"
    ].filter(Boolean).join(" · ");

    wrap.append(version,ua);
    outer.appendChild(wrap);
    return outer;
  }

  function familyCell(item){
    const outer=cell();
    const badge=D.createElement("span");
    badge.className="nodes-by-version__family";
    badge.textContent=text(item.family)||"Other";
    outer.appendChild(badge);
    return outer;
  }

  function nationCell(item){
    const outer=cell();
    const wrap=D.createElement("div");
    wrap.className="nodes-by-version__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-version__flag";
    flag.textContent=text(item.flag)||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="nodes-by-version__country-name";
    name.textContent=text(item.countryName)||"Unlocated";

    const code=D.createElement("span");
    code.className="nodes-by-version__country-code";
    code.textContent=text(item.country)||"--";

    wrap.append(flag,name,code);
    wrap.title=`${name.textContent} · ${code.textContent}`;
    outer.appendChild(wrap);
    return outer;
  }

  function renderRows(body,rows,offset=0){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-version__empty";
      empty.textContent="No user-agent/version rows match these filters.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes-by-version__row";
      row.setAttribute("role","row");
      row.dataset.family=item.family;

      const rank=cell();
      rank.textContent=String(offset+index+1);

      const nodes=cell({numeric:true});
      nodes.textContent=integer(item.count);

      const share=cell({numeric:true});
      share.textContent=pct(item.share);

      row.append(
        rank,
        agentCell(item),
        familyCell(item),
        nationCell(item),
        nodes,
        share
      );
      fragment.appendChild(row);
    });

    body.appendChild(fragment);
  }

  W.ZZXNodesByVersionUI=Object.freeze({
    __version:3,
    renderRows
  });
})();
