(function(){
  "use strict";
  const W=window;if(W.ZZXBitAgeModel?.__version>=1)return;
  const median=a=>{const x=a.slice().sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
  function build(blocks){
    const b=(Array.isArray(blocks)?blocks:[]).filter(x=>Number.isFinite(Number(x?.timestamp))).sort((a,z)=>Number(z.height||0)-Number(a.height||0));
    const ints=[];for(let i=0;i<b.length-1;i++){const d=Number(b[i].timestamp)-Number(b[i+1].timestamp);if(d>0&&d<7200)ints.push(d)}
    if(!ints.length)throw new Error("not enough valid block intervals");
    const mean=ints.reduce((a,x)=>a+x,0)/ints.length,med=median(ints),variance=ints.reduce((a,x)=>a+(x-mean)**2,0)/ints.length;
    return {tip:b[0],count:ints.length,mean,median:med,std:Math.sqrt(variance),blocksPerDay:86400/mean,deltaPct:(mean/600-1)*100};
  }
  W.ZZXBitAgeModel=Object.freeze({__version:1,build});
})();
