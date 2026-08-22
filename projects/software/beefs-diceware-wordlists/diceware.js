(() => {
  "use strict";

  const EXPECTED=7776;
  const BITS_PER_WORD=Math.log2(EXPECTED);

  function parseWordlist(text) {
    const map=new Map();
    const errors=[];
    const lines=String(text).replace(/\r/g,"").split("\n");

    for(let i=0;i<lines.length;i++) {
      const line=lines[i].trim();
      if(!line||line.startsWith("#"))continue;
      const m=line.match(/^([1-6]{5})[\s,;:\t]+(.+)$/);
      if(!m){errors.push(`Line ${i+1}: unrecognized format`);continue;}
      const code=m[1],word=m[2].trim();
      if(map.has(code))errors.push(`Line ${i+1}: duplicate code ${code}`);
      else map.set(code,word);
    }

    const expectedCodes=[];
    for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)for(let d=1;d<=6;d++)for(let e=1;e<=6;e++)expectedCodes.push(`${a}${b}${c}${d}${e}`);
    const missing=expectedCodes.filter(c=>!map.has(c));
    const words=[...map.values()];
    const uniqueWords=new Set(words);

    return {
      map,
      errors,
      count:map.size,
      missing,
      uniqueWords:uniqueWords.size,
      valid:map.size===EXPECTED&&missing.length===0&&uniqueWords.size===EXPECTED&&errors.length===0
    };
  }

  function secureDie() {
    while(true) {
      const x=new Uint8Array(1);
      crypto.getRandomValues(x);
      if(x[0]<252)return (x[0]%6)+1;
    }
  }

  function secureCode() {
    let out="";
    for(let i=0;i<5;i++)out+=secureDie();
    return out;
  }

  function generate(map,count) {
    if(!(map instanceof Map)||map.size!==EXPECTED)throw new Error("Load a valid 7,776-entry wordlist first.");
    const result=[];
    for(let i=0;i<count;i++) {
      const code=secureCode();
      const word=map.get(code);
      if(!word)throw new Error(`Wordlist missing code ${code}`);
      result.push({code,word});
    }
    return result;
  }

  function auditRolls(input) {
    const rolls=String(input).match(/[1-6]/g)?.map(Number)||[];
    const counts=[0,0,0,0,0,0];
    for(const r of rolls)counts[r-1]++;
    const n=rolls.length;
    const freq=counts.map(c=>n?c/n:0);
    const entropy=freq.reduce((s,p)=>p>0?s-p*Math.log2(p):s,0);
    const expected=n/6;
    const chi2=expected?counts.reduce((s,c)=>s+(c-expected)**2/expected,0):0;
    return {rolls:n,counts,frequencies:freq,shannonBitsPerRoll:entropy,maxBitsPerRoll:Math.log2(6),chiSquare:chi2,degreesOfFreedom:5};
  }

  window.DicewareCore=Object.freeze({EXPECTED,BITS_PER_WORD,parseWordlist,secureDie,secureCode,generate,auditRolls});
})();
