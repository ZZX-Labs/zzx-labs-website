(function(){
  "use strict";
  const W=window;if(W.ZZXBitTrackItValidator?.__version>=1)return;
  function classify(value){
    const a=String(value||"").trim();
    if(/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a))return "base58";
    if(/^bc1[ac-hj-np-z02-9]{11,71}$/i.test(a))return "bech32";
    return null;
  }
  W.ZZXBitTrackItValidator=Object.freeze({__version:1,classify});
})();
