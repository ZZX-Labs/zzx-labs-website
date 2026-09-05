// __partials/widgets/hashrate/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXHashrateModel?.__version>=2)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function hsToEH(hs){
    const n=finite(hs);
    return Number.isFinite(n)?n/1e18:NaN;
  }

  function build(data,now=Date.now()){
    const all=(data?.series||[])
      .map(row=>({ts:finite(row.ts),eh:hsToEH(row.hs)}))
      .filter(row=>Number.isFinite(row.eh)&&row.eh>0);

    const hasTimed=all.some(row=>Number.isFinite(row.ts)&&row.ts>0);
    let rows=all;

    if(hasTimed){
      const cutoff=now-24*3600*1000;
      const filtered=all.filter(row=>Number.isFinite(row.ts)&&row.ts>=cutoff);
      if(filtered.length>=2)rows=filtered;
    }else if(all.length>24){
      rows=all.slice(-24);
    }

    const values=rows.map(row=>row.eh).filter(Number.isFinite);
    if(!values.length)throw new Error("no usable hashrate values");

    const mean=values.reduce((a,b)=>a+b,0)/values.length;
    const current=hsToEH(data.currentHs);
    const nowEH=Number.isFinite(current)?current:values[values.length-1];

    return {
      currentEH:nowEH,
      meanEH:mean,
      lowEH:Math.min(...values),
      highEH:Math.max(...values),
      deltaPct:mean>0?100*(nowEH-mean)/mean:NaN,
      difficulty:finite(data.difficulty),
      rows,
      values,
      source:data.source,
      updated:rows[rows.length-1]?.ts||now
    };
  }

  function energy(currentEH,meanEH,jPerTH){
    const efficiency=Math.max(0,finite(jPerTH));
    if(!Number.isFinite(efficiency))return null;

    // 1 EH/s = 1,000,000 TH/s.
    // Power (W) = TH/s × J/TH.
    const currentGW=currentEH*1e6*efficiency/1e9;
    const meanGW=meanEH*1e6*efficiency/1e9;

    return {
      efficiency,
      currentGW,
      currentGWhPerHour:currentGW,
      meanGWhPerDay:meanGW*24
    };
  }

  W.ZZXHashrateModel=Object.freeze({
    __version:2,
    hsToEH,
    build,
    energy
  });
})();
