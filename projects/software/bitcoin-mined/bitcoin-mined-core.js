(() => {
  "use strict";
  const HALVING=210000,MAX=21000000;
  function epoch(h){return Math.floor(Math.max(0,+h||0)/HALVING);}
  function subsidy(h){const e=epoch(h);return e>=64?0:50/2**e;}
  function issued(h){h=Math.max(-1,Math.floor(+h));if(h<0)return 0;let total=0;for(let e=0;e<64;e++){const start=e*HALVING;if(start>h)break;const end=Math.min(h,(e+1)*HALVING-1);total+=(end-start+1)*(50/2**e);}return total;}
  function state(h){h=Math.max(0,Math.floor(+h||0));const e=epoch(h),start=e*HALVING,next=(e+1)*HALVING,s=subsidy(h),total=issued(h);return{height:h,epoch:e,subsidyBtc:s,epochStart:start,nextHalvingHeight:next,blocksRemaining:next-h,epochBlocksMined:h-start+1,epochIssuanceBtc:(h-start+1)*s,issuedBtc:total,remainingTo21mBtc:Math.max(0,MAX-total),issuedPercent:total/MAX*100};}
  window.BitcoinMinedCore=Object.freeze({HALVING,MAX,epoch,subsidy,issued,state});
})();
