(() => {
"use strict";

const HALVING_INTERVAL=210000;
const AVG_BLOCK_SECONDS=600;

function subsidySats(height){
  const epoch=Math.floor(Math.max(0,height)/HALVING_INTERVAL);
  if(epoch>=64)return 0;
  return Math.floor(5000000000 / 2**epoch);
}
function epoch(height){
  const e=Math.floor(height/HALVING_INTERVAL);
  const start=e*HALVING_INTERVAL,end=start+HALVING_INTERVAL-1;
  return{
    epoch:e,
    startHeight:start,
    endHeight:end,
    blockInEpoch:height-start,
    blocksRemaining:end-height,
    progressPct:100*(height-start)/HALVING_INTERVAL,
    subsidySats:subsidySats(height)
  };
}
function estimateNextBlock(lastBlockTimeMs=Date.now()){
  return new Date(lastBlockTimeMs+AVG_BLOCK_SECONDS*1000);
}
function feeSummary(j){
  return{
    fastest:Number(j.fastestFee??j.fastest??0),
    halfHour:Number(j.halfHourFee??j.halfHour??0),
    hour:Number(j.hourFee??j.hour??0),
    economy:Number(j.economyFee??j.economy??0),
    minimum:Number(j.minimumFee??j.minimum??0)
  };
}
function normalized({height,mempoolCount,mempoolVsize,mempoolTotalFee,fees,lastBlockTimeMs,source}){
  const e=epoch(height);
  return{
    updatedAt:new Date().toISOString(),
    source,
    height,
    mempool:{count:mempoolCount,vsize:mempoolVsize,totalFeeBTC:mempoolTotalFee},
    fees:feeSummary(fees||{}),
    epoch:e,
    nextHalvingHeight:(e.epoch+1)*HALVING_INTERVAL,
    estimatedNextHalving:new Date(Date.now()+e.blocksRemaining*AVG_BLOCK_SECONDS*1000).toISOString(),
    estimatedNextBlock:estimateNextBlock(lastBlockTimeMs).toISOString()
  };
}
window.BlockClockCore=Object.freeze({HALVING_INTERVAL,AVG_BLOCK_SECONDS,subsidySats,epoch,feeSummary,normalized});
})();
