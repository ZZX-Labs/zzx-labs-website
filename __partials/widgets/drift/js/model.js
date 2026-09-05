// __partials/widgets/drift/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXDriftModel?.__version>=2)return;

  const TARGET=600;

  function median(values){
    const x=[...values].sort((a,b)=>a-b);
    const m=Math.floor(x.length/2);
    return x.length%2?x[m]:(x[m-1]+x[m])/2;
  }

  function build(blocks,limit=10){
    const rows=(Array.isArray(blocks)?blocks:[])
      .filter(b=>Number.isFinite(Number(b?.timestamp)))
      .sort((a,b)=>Number(b?.height||0)-Number(a?.height||0))
      .slice(0,Math.max(3,limit));

    const intervals=[];

    for(let i=0;i<rows.length-1;i++){
      const sec=Number(rows[i].timestamp)-Number(rows[i+1].timestamp);
      if(Number.isFinite(sec)&&sec>0&&sec<7200)intervals.push(sec);
    }

    if(!intervals.length)throw new Error("no valid completed block intervals");

    const actual=intervals.reduce((a,b)=>a+b,0);
    const ideal=intervals.length*TARGET;
    const drift=actual-ideal;
    const mean=actual/intervals.length;
    const med=median(intervals);
    const fast=intervals.filter(x=>x<TARGET).length;
    const slow=intervals.filter(x=>x>TARGET).length;
    const exact=intervals.filter(x=>x===TARGET).length;

    return {
      intervals,
      count:intervals.length,
      actual,
      ideal,
      drift,
      mean,
      median:med,
      last:intervals[0],
      fast,
      slow,
      exact,
      blocksPerDay:86400/mean,
      newest:rows[0],
      oldest:rows[intervals.length]
    };
  }

  W.ZZXDriftModel=Object.freeze({
    __version:2,
    TARGET,
    build
  });
})();
