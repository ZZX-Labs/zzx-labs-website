// __partials/widgets/spp/js/model.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXSppModel?.__version>=4)return;
  const C=()=>W.ZZXSppConstants;

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}

  function issuedSatsAtHeight(height){
    const h=Math.floor(finite(height));
    if(!Number.isFinite(h)||h<0)return 0n;

    let blocks=BigInt(h+1),era=0n,total=0n;
    while(blocks>0n){
      const subsidy=C().initialSubsidySats>>era;
      if(subsidy<=0n)break;
      const take=blocks>C().halvingInterval?C().halvingInterval:blocks;
      total+=take*subsidy;
      blocks-=take;
      era+=1n;
    }
    return total;
  }

  function build({height,issuedSats,populationModel,at=Date.now()}){
    const h=Math.floor(finite(height));
    if(!Number.isFinite(h)||h<0)throw new Error("invalid chain-tip height");
    if(!populationModel)throw new Error("population model unavailable");

    const issued=typeof issuedSats==="bigint"?issuedSats:issuedSatsAtHeight(h);
    if(issued<0n)throw new Error("invalid issued satoshi count");

    const est=W.ZZXPopulation.estimateFromModel(populationModel,at);
    const pop=finite(est.population);
    if(!(pop>0))throw new Error("invalid population estimate");

    const issuedN=Number(issued);
    const terminalN=Number(C().terminalSupplySats);
    const nominalN=Number(C().nominalCapSats);
    const issuedBtc=issuedN/1e8;
    const remainingSats=C().terminalSupplySats-issued;
    const remainingBtc=Number(remainingSats)/1e8;

    return {
      height:h,
      at:Number(at),
      issuedSats:issued,
      issuedBtc,
      remainingSats,
      remainingBtc,
      progress:issuedN/terminalN,
      population:pop,
      populationEstimate:est,
      issuedSatsPerPerson:issuedN/pop,
      issuedBtcPerPerson:issuedBtc/pop,
      nominalSatsPerPerson:nominalN/pop,
      terminalSatsPerPerson:terminalN/pop,
      remainingSatsPerPerson:Number(remainingSats)/pop,
      peoplePerIssuedBtc:pop/issuedBtc,
      peoplePerNominalBtc:pop/C().nominalCapBtc,
      peoplePerTerminalBtc:pop/C().terminalSupplyBtc,
      oneSatPopulationShare:(1/pop)*100
    };
  }

  W.ZZXSppModel=Object.freeze({__version:4,issuedSatsAtHeight,build});
})();
