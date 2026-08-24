(() => {
  "use strict";

  const ACID_TO_NEUTRAL=0.877;

  function clamp(v,a,b){return Math.min(b,Math.max(a,Number(v)||0));}

  function potency({massG,thcaPct,thcPct,cbdaPct,cbdPct,recoveryPct}) {
    const massMg=Math.max(0,Number(massG)||0)*1000;
    const potentialThcMg=massMg*((clamp(thcaPct,0,100)/100)*ACID_TO_NEUTRAL + clamp(thcPct,0,100)/100);
    const potentialCbdMg=massMg*((clamp(cbdaPct,0,100)/100)*ACID_TO_NEUTRAL + clamp(cbdPct,0,100)/100);
    const recovery=clamp(recoveryPct,0,100)/100;
    return {
      acidToNeutralFactor:ACID_TO_NEUTRAL,
      potentialThcMg,
      recoveredThcMg:potentialThcMg*recovery,
      potentialCbdMg,
      recoveredCbdMg:potentialCbdMg*recovery,
      recoveryFraction:recovery
    };
  }

  function servings(totalThcMg,totalCbdMg,count) {
    const n=Math.max(1,Math.floor(Number(count)||1));
    return {
      count:n,
      thcMgEach:Math.max(0,Number(totalThcMg)||0)/n,
      cbdMgEach:Math.max(0,Number(totalCbdMg)||0)/n
    };
  }

  function extraction({massG,targetPct,efficiencyPct,recoveryPct,purityPct}) {
    const targetInputMg=Math.max(0,Number(massG)||0)*1000*clamp(targetPct,0,100)/100;
    const efficiency=clamp(efficiencyPct,0,100)/100;
    const recovery=clamp(recoveryPct,0,100)/100;
    const recoveredTargetMg=targetInputMg*efficiency*recovery;
    const purity=Math.max(.001,clamp(purityPct,.1,100)/100);
    const concentrateMassG=(recoveredTargetMg/purity)/1000;
    return {
      targetInputMg,
      recoveredTargetMg,
      concentrateMassG,
      overallRecoveryPct:efficiency*recovery*100,
      purityPct:purity*100
    };
  }

  function terpeneProfile(values) {
    const entries=Object.entries(values).map(([name,value])=>[name,Math.max(0,Number(value)||0)]);
    const total=entries.reduce((s,[,v])=>s+v,0);
    return {
      total,
      items:entries.map(([name,value])=>({name,value,ratio:total?value/total:0,percent:total?value/total*100:0}))
    };
  }

  window.BhopalChemistry=Object.freeze({ACID_TO_NEUTRAL,potency,servings,extraction,terpeneProfile});
})();
