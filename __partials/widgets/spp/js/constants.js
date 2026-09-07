// __partials/widgets/spp/js/constants.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXSppConstants?.__version>=4)return;
  W.ZZXSppConstants=Object.freeze({
    __version:4,
    satsPerBtc:100000000n,
    nominalCapBtc:21000000,
    nominalCapSats:2100000000000000n,
    terminalSupplyBtc:20999999.9769,
    terminalSupplySats:2099999997690000n,
    halvingInterval:210000n,
    initialSubsidySats:5000000000n,
    refreshMs:15000,
    populationTickMs:1000,
    projectPath:"/projects/software/spp/",
    sharedChainPath:"/__partials/widgets/_shared/zzx-chain.js",
    sharedPopulationPath:"/__partials/widgets/_shared/zzx-population.js"
  });
})();
