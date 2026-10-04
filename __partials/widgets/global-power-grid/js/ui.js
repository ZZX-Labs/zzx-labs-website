// __partials/widgets/global-power-grid/js/ui.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXGlobalPowerGridUI?.__version||0)>=2)return;

  function fmtPower(mw){
    const n=Number(mw);
    if(!Number.isFinite(n))return "—";
    if(n>=1e6)return `${(n/1e6).toFixed(2)} TW`;
    if(n>=1000)return `${(n/1000).toFixed(2)} GW`;
    return `${n.toFixed(1)} MW`;
  }

  function fmtEnergy(mwh){
    const n=Number(mwh);
    if(!Number.isFinite(n))return "—";
    if(n>=1e9)return `${(n/1e9).toFixed(2)} PWh`;
    if(n>=1e6)return `${(n/1e6).toFixed(2)} TWh`;
    if(n>=1000)return `${(n/1000).toFixed(2)} GWh`;
    return `${n.toFixed(1)} MWh`;
  }

  function fmtHash(eh){
    const n=Number(eh);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(2)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function sourceLabel(row){
    if(row.source==="unavailable")return "—";
    if(row.editionYear){
      return `CIA World Factbook · ed. ${row.editionYear}${row.observationYear?` · obs. ${row.observationYear}`:""}`;
    }
    return `${row.source}${row.sourceYear?` · ${row.sourceYear}`:""}`;
  }

  function sourceCell(row){
    const td=D.createElement("td");
    const label=sourceLabel(row);

    if(row.sourceUrl){
      const a=D.createElement("a");
      a.href=row.sourceUrl;
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.className="gpg__source-link";
      a.textContent=label;
      td.appendChild(a);
    }else{
      td.textContent=label;
    }

    if(row.source==="unavailable")td.className="gpg__missing";
    return td;
  }

  function renderRows(tbody,rows,period,model){
    tbody.replaceChildren();

    for(const row of rows){
      const tr=D.createElement("tr");
      const nation=D.createElement("td");
      const wrap=D.createElement("div");
      wrap.className="gpg__nation";

      const f=D.createElement("span");
      f.className="gpg__flag";
      f.textContent=row.flag;

      const n=D.createElement("span");
      n.className="gpg__name";
      n.textContent=row.countryName;

      const i=D.createElement("span");
      i.className="gpg__iso";
      i.textContent=row.country;

      wrap.append(f,n,i);
      nation.appendChild(wrap);

      function td(text,missing=false){
        const el=D.createElement("td");
        el.textContent=text;
        if(missing)el.className="gpg__missing";
        return el;
      }

      function powerOrEnergy(v){
        if(!Number.isFinite(v))return "—";
        return period==="hour"?fmtPower(v):fmtEnergy(model.periodEnergyMWh(v,period));
      }

      tr.append(
        nation,
        td(powerOrEnergy(row.generationMW),!Number.isFinite(row.generationMW)),
        td(powerOrEnergy(row.loadMW),!Number.isFinite(row.loadMW)),
        td(fmtPower(row.peakMW),!Number.isFinite(row.peakMW)),
        td(fmtPower(row.capacityMW),!Number.isFinite(row.capacityMW)),
        td(fmtPower(row.headroomMW),!Number.isFinite(row.headroomMW)),
        td(fmtHash(row.absoluteMiningCeilingEH),!Number.isFinite(row.absoluteMiningCeilingEH)),
        sourceCell(row)
      );
      tbody.appendChild(tr);
    }
  }

  function renderMix(container,mix){
    container.replaceChildren();
    for(const row of mix){
      const d=D.createElement("div");
      d.className="gpg__mix-item";

      const s=D.createElement("span");
      s.textContent=row.source.replace(/([A-Z])/g," $1");

      const v=D.createElement("strong");
      v.textContent=`${fmtPower(row.mw)} · ${(row.share*100).toFixed(1)}%`;

      d.append(s,v);
      container.appendChild(d);
    }
  }

  function renderHistoryOptions(select,countries,selected){
    select.replaceChildren();

    for(const row of countries){
      const option=D.createElement("option");
      option.value=row.country;
      option.textContent=`${row.flag} ${row.countryName} [${row.country}] · ${row.records} records`;
      if(row.country===selected)option.selected=true;
      select.appendChild(option);
    }
  }

  function renderHistoryRows(tbody,history){
    tbody.replaceChildren();

    for(const row of [...history].reverse()){
      const tr=D.createElement("tr");

      function td(text,missing=false){
        const el=D.createElement("td");
        el.textContent=text;
        if(missing)el.className="gpg__missing";
        return el;
      }

      const source=D.createElement("td");
      const label=`CIA World Factbook ${row.editionYear}`;

      if(row.sourceUrl){
        const a=D.createElement("a");
        a.href=row.sourceUrl;
        a.target="_blank";
        a.rel="noopener noreferrer";
        a.className="gpg__source-link";
        a.textContent=label;
        source.appendChild(a);
      }else{
        source.textContent=label;
      }

      tr.append(
        td(row.editionYear??"—",!row.editionYear),
        td(row.observationYear??"—",!row.observationYear),
        td(fmtPower(row.generationMW),!Number.isFinite(row.generationMW)),
        td(fmtPower(row.loadMW),!Number.isFinite(row.loadMW)),
        td(fmtPower(row.capacityMW),!Number.isFinite(row.capacityMW)),
        source
      );

      tbody.appendChild(tr);
    }
  }

  W.ZZXGlobalPowerGridUI=Object.freeze({
    __version:2,
    fmtPower,
    fmtEnergy,
    fmtHash,
    sourceLabel,
    renderRows,
    renderMix,
    renderHistoryOptions,
    renderHistoryRows
  });
})();
