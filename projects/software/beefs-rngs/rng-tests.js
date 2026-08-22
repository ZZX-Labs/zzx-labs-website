(() => {
  "use strict";

  function monobit(bytes) {
    let ones=0;
    for(const b of bytes)for(let i=0;i<8;i++)ones+=(b>>i)&1;
    const bits=bytes.length*8;
    return {bits,ones,zeros:bits-ones,oneFraction:bits?ones/bits:0};
  }

  function byteChiSquare(bytes) {
    const counts=new Array(256).fill(0);
    for(const b of bytes)counts[b]++;
    const expected=bytes.length/256;
    const chi2=expected?counts.reduce((s,c)=>s+(c-expected)**2/expected,0):0;
    return {chiSquare:chi2,degreesOfFreedom:255,minCount:Math.min(...counts),maxCount:Math.max(...counts)};
  }

  function serialCorrelation(bytes) {
    if(bytes.length<2)return 0;
    let mean=0;
    for(const b of bytes)mean+=b;
    mean/=bytes.length;
    let num=0,den=0;
    for(let i=0;i<bytes.length-1;i++)num+=(bytes[i]-mean)*(bytes[i+1]-mean);
    for(const b of bytes)den+=(b-mean)**2;
    return den?num/den:0;
  }

  function runs(bytes) {
    let prev=null,runs=0,bits=0,ones=0;
    for(const b of bytes) {
      for(let i=7;i>=0;i--) {
        const bit=(b>>i)&1;
        if(prev===null||bit!==prev)runs++;
        prev=bit;bits++;ones+=bit;
      }
    }
    const p=bits?ones/bits:0;
    const expected=bits?2*bits*p*(1-p)+1:0;
    return {runs,bits,ones,expectedRuns:expected,deviation:runs-expected};
  }

  function all(bytes) {
    return {bytes:bytes.length,monobit:monobit(bytes),byteFrequency:byteChiSquare(bytes),serialCorrelation:serialCorrelation(bytes),runs:runs(bytes)};
  }

  window.BeefRNGTests=Object.freeze({monobit,byteChiSquare,serialCorrelation,runs,all});
})();
