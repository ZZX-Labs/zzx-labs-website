// __partials/widgets/global-power-grid/js/ui.js
(function(){
  "use strict";
  const W=window,D=document;
  if(Number(W.ZZXGlobalPowerGridUI?.__version||0)>=1)return;

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

  function renderRows(tbody,rows,period,model){
    tbody.replaceChildren();
    for(const row of rows){
      const tr=D.createElement("tr");
      const nation=D.createElement("td");
      const w=D.createElement("div");w.className="gpg__nation";
      const f=D.createElement("span");f.className="gpg__flag";f.textContent=row.flag;
      const n=D.createElement("span");n.className="gpg__name";n.textContent=row.countryName;
      const i=D.createElement("span");i.className="gpg__iso";i.textContent=row.country;
      w.append(f,n,i);nation.appendChild(w);

      function td(text,missing=false){
        const el=D.createElement("td");el.textContent=text;
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
        td(`${row.source}${row.sourceYear?` · ${row.sourceYear}`:""}`,row.source==="unavailable")
      );
      tbody.appendChild(tr);
    }
  }

  function renderMix(container,mix){
    container.replaceChildren();
    for(const row of mix){
      const d=D.createElement("div");d.className="gpg__mix-item";
      const s=D.createElement("span");s.textContent=row.source.replace(/([A-Z])/g," $1");
      const v=D.createElement("strong");v.textContent=`${fmtPower(row.mw)} · ${(row.share*100).toFixed(1)}%`;
      d.append(s,v);container.appendChild(d);
    }
  }

  W.ZZXGlobalPowerGridUI=Object.freeze({__version:1,fmtPower,fmtEnergy,fmtHash,renderRows,renderMix});
})();
