(function(){
  "use strict";
  const W=window;if(W.ZZXClockDriftModel?.__version>=1)return;
  const median=a=>{const x=a.slice().sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  function build(blocks){
    const sorted=(Array.isArray(blocks)?blocks:[])
      .filter(b=>Number.isFinite(Number(b?.timestamp)))
      .sort((a,b)=>Number(b.height||0)-Number(a.height||0))
      .slice(0,10);
    if(sorted.length<2)throw new Error("insufficient block timestamps");
    const stamps=sorted.map(b=>Number(b.timestamp));
    const intervals=[];
    for(let i=0;i<stamps.length-1;i++){const v=stamps[i]-stamps[i+1];if(v>=0&&v<7200)intervals.push(v)}
    if(!intervals.length)throw new Error("no valid block intervals");
    const mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
    return {tip:sorted[0],tipTs:stamps[0],last:intervals[0],mean,median:median(intervals),count:intervals.length};
  }
  W.ZZXClockDriftModel=Object.freeze({__version:1,build});
})();
