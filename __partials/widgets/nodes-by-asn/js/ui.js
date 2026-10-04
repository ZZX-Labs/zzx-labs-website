// __partials/widgets/nodes-by-asn/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXNodesByAsnUI?.__version||0)>=2)return;

  function text(value){return String(value??"").trim();}
  function integer(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }
  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function cell({numeric=false}={}){
    const el=D.createElement("div");
    el.setAttribute("role","cell");
    if(numeric)el.classList.add("nodes-by-asn__num");
    return el;
  }

  function asnCell(item){
    const outer=cell();
    const wrap=D.createElement("div");
    wrap.className="nodes-by-asn__asn";

    const code=D.createElement("span");
    code.className="nodes-by-asn__asn-code";
    code.textContent=text(item?.asn)||"AS?";

    const org=D.createElement("span");
    org.className="nodes-by-asn__org";
    org.textContent=text(item?.organization)||"Unknown organization";
    org.title=org.textContent;

    wrap.append(code,org);
    outer.appendChild(wrap);
    return outer;
  }

  function nationCell(item){
    const outer=cell();
    const wrap=D.createElement("div");
    wrap.className="nodes-by-asn__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-asn__flag";
    flag.textContent=text(item?.flag)||"🏴";
    flag.setAttribute("aria-hidden","true");

    const name=D.createElement("span");
    name.className="nodes-by-asn__nation-name";
    name.textContent=text(item?.countryName)||"Unlocated";

    const iso=D.createElement("span");
    iso.className="nodes-by-asn__iso";
    iso.textContent=text(item?.country)||"--";

    wrap.append(flag,name,iso);
    wrap.title=`${name.textContent} · ${iso.textContent}`;
    outer.appendChild(wrap);
    return outer;
  }

  function renderRows(body,rows,offset=0){
    body.replaceChildren();

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-asn__empty";
      empty.textContent="No ASN × nation rows match these filters.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes-by-asn__row";
      row.setAttribute("role","row");

      const rank=cell();
      rank.textContent=String(offset+index+1);

      const nodes=cell({numeric:true});
      nodes.textContent=integer(item.nodes);

      const share=cell({numeric:true});
      share.textContent=pct(item.share);

      const asnShare=cell({numeric:true});
      asnShare.textContent=pct(item.asnShare);

      row.append(
        rank,
        asnCell(item),
        nationCell(item),
        nodes,
        share,
        asnShare
      );
      fragment.appendChild(row);
    });

    body.appendChild(fragment);
  }

  function renderLeaders(container,leaders){
    container.replaceChildren();
    const rows=(leaders||[]).slice(0,5);

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-asn__empty";
      empty.textContent="No ASN leaders available.";
      container.appendChild(empty);
      return;
    }

    const max=Math.max(...rows.map(row=>Number(row.nodes)||0),1);
    const fragment=D.createDocumentFragment();

    for(const item of rows){
      const row=D.createElement("div");
      row.className="nodes-by-asn__leader";

      const label=D.createElement("div");
      label.className="nodes-by-asn__leader-label";

      const asn=D.createElement("strong");
      asn.textContent=item.asn;

      const org=D.createElement("span");
      org.textContent=item.organization;
      org.title=item.organization;

      label.append(asn,org);

      const track=D.createElement("div");
      track.className="nodes-by-asn__leader-track";

      const bar=D.createElement("i");
      bar.style.width=`${Math.max(0,Math.min(100,(item.nodes/max)*100)).toFixed(2)}%`;
      track.appendChild(bar);

      const value=D.createElement("div");
      value.className="nodes-by-asn__leader-value";
      value.textContent=`${integer(item.nodes)} · ${pct(item.asnShare)}`;

      row.append(label,track,value);
      fragment.appendChild(row);
    }

    container.appendChild(fragment);
  }

  W.ZZXNodesByAsnUI=Object.freeze({
    __version:2,
    renderRows,
    renderLeaders
  });
})();
