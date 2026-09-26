(function(){
  "use strict";
  const W=window;
  const spec=W.ZZXBitcoinTickerPurchasingPowerRegistry?.register({
    id:"power-energy",label:"Power/Energy",order:14
  });
  W.ZZXBitcoinTickerPurchasingPowerCategoryPowerEnergy=
    spec||Object.freeze({id:"power-energy",label:"Power/Energy",order:14,panel:"references"});
})();
