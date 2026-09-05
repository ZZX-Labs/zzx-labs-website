// __partials/widgets/tip-drift/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTipDriftModel?.__version>=4)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeBlocks(rows,limit){
    return (Array.isArray(rows)?rows:[])
      .map(row=>({
        height:finite(row?.height),
        timestamp:finite(row?.timestamp),
        id:String(row?.id||row?.hash||"")
      }))
      .filter(row=>Number.isFinite(row.timestamp))
      .sort((a,b)=>b.timestamp-a.timestamp)
      .slice(0,Math.max(2,Number(limit)||8));
  }

  function build(height,blocks,nowSec=Date.now()/1000){
    const sample=normalizeBlocks(
      blocks,
      W.ZZXTipDriftSources.sampleBlocks
    );

    if(!sample.length){
      throw new Error("block timestamp sample unavailable");
    }

    const tip=sample[0];
    const h=Number.isFinite(finite(height))
      ? finite(height)
      : tip.height;

    const ageSec=Math.max(0,nowSec-tip.timestamp);

    const intervals=[];

    for(let i=0;i<sample.length-1;i++){
      const delta=sample[i].timestamp-sample[i+1].timestamp;
      if(Number.isFinite(delta)&&delta>=0)intervals.push(delta);
    }

    const avgSec=intervals.length
      ? intervals.reduce((sum,v)=>sum+v,0)/intervals.length
      : NaN;

    const lastSec=intervals.length?intervals[0]:NaN;
    const target=W.ZZXTipDriftSources.targetSeconds;

    return {
      height:h,
      tipTimestamp:tip.timestamp,
      ageSec,
      sampleBlocks:sample.length,
      sampleIntervals:intervals.length,
      avgSec,
      lastSec,
      avgDriftSec:Number.isFinite(avgSec)?avgSec-target:NaN,
      lastDriftSec:Number.isFinite(lastSec)?lastSec-target:NaN
    };
  }

  function driftState(seconds){
    const n=finite(seconds);
    if(!Number.isFinite(n))return "unknown";

    const minutes=n/60;

    if(minutes>0.25)return "slow";
    if(minutes<-0.25)return "fast";
    return "target";
  }

  W.ZZXTipDriftModel=Object.freeze({
    __version:4,
    normalizeBlocks,
    build,
    driftState
  });
})();
