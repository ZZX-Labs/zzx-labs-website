// __partials/widgets/hashrate-by-nation/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateNationModel?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeShares(rows,basis){
    const input=Array.isArray(rows)?rows:[];
    const cleaned=[];

    for(const row of input){
      if(!row||typeof row!=="object")continue;

      const iso=String(row.iso||row.country_code||row.country||"").trim().toUpperCase();
      const name=String(row.name||row.country_name||iso).trim()||iso;
      const shareRaw=finite(row.share ?? row.fraction ?? row.percent);
      if(!iso||!Number.isFinite(shareRaw)||shareRaw<=0)continue;

      cleaned.push({
        iso,
        name,
        rawShare:shareRaw>1?shareRaw/100:shareRaw,
        source:String(row.source||basis||"local estimate"),
        confidence:Number.isFinite(finite(row.confidence))?Math.max(0,Math.min(1,finite(row.confidence))):NaN
      });
    }

    const sum=cleaned.reduce((s,row)=>s+row.rawShare,0);
    if(!(sum>0))return [];

    return cleaned.map(row=>({
      ...row,
      share:row.rawShare/sum
    }));
  }

  function fromCountryCounts(rows){
    const input=Array.isArray(rows)?rows:[];
    const counts=[];

    for(const row of input){
      if(!row||typeof row!=="object")continue;
      const iso=String(row.iso||row.code||row.country_code||row.name||"").trim().toUpperCase();
      const name=String(row.country||row.label||row.name||iso).trim()||iso;
      const count=finite(row.count??row.nodes??row.value);
      if(!iso||!Number.isFinite(count)||count<=0)continue;
      counts.push({iso,name,count});
    }

    const total=counts.reduce((s,row)=>s+row.count,0);
    if(!(total>0))return [];

    return counts.map(row=>({
      iso:row.iso,
      name:row.name,
      share:row.count/total,
      source:"node-geography proxy",
      confidence:NaN
    }));
  }

  function allocate(globalEH,shares,mode,topN=10){
    const g=finite(globalEH);
    if(!(g>0))throw new Error("global hashrate unavailable");

    const rows=(shares||[])
      .filter(row=>Number.isFinite(row.share)&&row.share>0)
      .map(row=>({
        ...row,
        estimatedEH:g*row.share,
        basis:mode
      }))
      .sort((a,b)=>b.estimatedEH-a.estimatedEH);

    const top=rows.slice(0,topN);
    const shownShare=top.reduce((s,row)=>s+row.share,0);

    return {
      globalEH:g,
      rows:top,
      allRows:rows,
      shownShare,
      unallocatedShare:Math.max(0,1-shownShare),
      mode
    };
  }

  W.ZZXHashrateNationModel=Object.freeze({
    __version:3,
    normalizeShares,
    fromCountryCounts,
    allocate
  });
})();
