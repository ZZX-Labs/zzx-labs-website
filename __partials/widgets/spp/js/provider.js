// __partials/widgets/spp/js/provider.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXSppProvider?.__version>=4)return;

  async function load(force=false){
    await W.ZZXSppDeps.ensureShared();

    const [tip,populationModel]=await Promise.all([
      W.ZZXChain.tipHeight(!!force),
      W.ZZXPopulation.load(!!force)
    ]);

    const height=Number(tip?.height);
    if(!Number.isFinite(height))throw new Error("chain tip unavailable");

    const issued=W.ZZXChain.issuedSatsAtHeight(height);
    if(typeof issued!=="bigint")throw new Error("ZZXChain returned non-BigInt issuance");

    const localIssued=W.ZZXSppModel.issuedSatsAtHeight(height);
    if(localIssued!==issued)throw new Error("consensus issuance cross-check mismatch");

    return {
      height,
      issued,
      tipSource:String(tip?.source||"ZZXChain"),
      populationModel,
      populationSource:String(populationModel?.source||"ZZXPopulation"),
      populationLiveAnchor:!!populationModel?.liveAnchor,
      fetchedAt:Date.now()
    };
  }

  W.ZZXSppProvider=Object.freeze({__version:4,load});
})();
