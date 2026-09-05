(function(){
  "use strict";
  const W=window;if(W.ZZXBlockStatsModel?.__version>=1)return;
  function build(blocks){
    const b=(Array.isArray(blocks)?blocks:[]).filter(x=>Number.isFinite(Number(x?.timestamp))).sort((a,z)=>Number(z.height||0)-Number(a.height||0));
    if(!b.length)throw new Error("empty recent block list");
    const tip=b[0],stamps=b.slice(0,7).map(x=>Number(x.timestamp)),ints=[];
    for(let i=0;i<stamps.length-1;i++){const d=stamps[i]-stamps[i+1];if(d>=0&&d<7200)ints.push(d)}
    const mean=ints.length?ints.reduce((a,x)=>a+x,0)/ints.length:NaN;
    const extras=tip.extras||{};
    return {
      tip,mean,
      fees:Number(extras.totalFees ?? tip.total_fees),
      avgFeeRate:Number(extras.avgFeeRate ?? tip.avg_fee_rate)
    };
  }
  W.ZZXBlockStatsModel=Object.freeze({__version:1,build});
})();
