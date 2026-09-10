// __partials/widgets/hashrate-by-nation/js/ui.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  if(Number(W.ZZXHashrateNationUI?.__version||0)>=4)return;

  function fmtEH(value){
    const n=Number(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(3)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function cell(text,className=""){
    const td=D.createElement("td");
    td.textContent=String(text);
    if(className)td.className=className;
    return td;
  }

  function renderRows(tbody,rows){
    tbody.replaceChildren();

    for(const row of rows){
      const tr=D.createElement("tr");

      const nation=D.createElement("td");
      const wrap=D.createElement("div");
      wrap.className="hbn__nation";

      const flag=D.createElement("span");
      flag.className="hbn__nation-flag";
      flag.textContent=row.flag||"🏴";

      const name=D.createElement("span");
      name.className="hbn__nation-name";
      name.textContent=row.countryName||row.country||"Unlocated";

      const iso=D.createElement("span");
      iso.className="hbn__iso";
      iso.textContent=row.country||"--";

      wrap.append(flag,name,iso);
      nation.appendChild(wrap);

      const confidence=D.createElement("td");
      const chip=D.createElement("span");
      chip.className="hbn__confidence";
      chip.textContent=pct(row.confidence);
      confidence.appendChild(chip);

      tr.append(
        nation,
        cell(fmtEH(row.estimateEH)),
        cell(`${fmtEH(row.lowEH)} – ${fmtEH(row.highEH)}`),
        cell(pct(row.share)),
        confidence
      );

      tbody.appendChild(tr);
    }
  }

  function renderLegend(container,rows){
    container.replaceChildren();

    for(const row of rows.slice(0,5)){
      const item=D.createElement("span");
      item.className="hbn__legend-item";

      const swatch=D.createElement("i");
      swatch.setAttribute("aria-hidden","true");

      const label=D.createElement("span");
      label.textContent=`${row.flag} ${row.countryName} · ${pct(row.share)}`;

      item.append(swatch,label);
      container.appendChild(item);
    }
  }

  W.ZZXHashrateNationUI=Object.freeze({
    __version:4,
    fmtEH,
    pct,
    renderRows,
    renderLegend
  });
})();
