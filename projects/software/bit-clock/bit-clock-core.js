(() => {
  "use strict";
  const HALVING=210000,MAX_BTC=21000000;
  function epoch(height){return Math.floor(Math.max(0,Number(height)||0)/HALVING);}
  function subsidy(height){const e=epoch(height);if(e>=64)return 0;return 50/2**e;}
  function nextHalving(height){const h=Math.max(0,Math.floor(Number(height)||0)),e=epoch(h),next=(e+1)*HALVING;return{epoch:e,nextHeight:next,blocksRemaining:Math.max(0,next-h),progress:(h-e*HALVING)/HALVING};}
  function issuedThroughHeight(height){
    let h=Math.max(-1,Math.floor(Number(height))),issued=0,e=0;
    if(h<0)return 0;
    while(e<64){
      const start=e*HALVING;if(start>h)break;
      const end=Math.min(h,(e+1)*HALVING-1),blocks=end-start+1;issued+=blocks*(50/2**e);e++;
    }
    return issued;
  }
  function schedule(maxEpoch=12){const out=[];for(let e=0;e<=maxEpoch;e++){const sub=50/2**e;out.push({epoch:e,startHeight:e*HALVING,endHeight:(e+1)*HALVING-1,subsidyBtc:sub,epochIssuanceBtc:sub*HALVING});}return out;}
  window.BitClockCore=Object.freeze({HALVING,MAX_BTC,epoch,subsidy,nextHalving,issuedThroughHeight,schedule});
})();
