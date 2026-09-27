(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerUnits?.__version>=7)return;

  /*
   * Canonical ticker denomination ladder.
   * btc = number of BTC represented by one displayed unit.
   *
   * 1 Ksat = 1,000 sat = 0.00001 BTC = 10 μBTC.
   * 1 msat = 0.001 sat.
   * 1 μsat = 0.000001 sat (display/accounting only; not an on-chain unit).
   */
  const units=Object.freeze([
    {id:"kbtc",label:"1 kBTC",code:"kBTC",btc:1e3},
    {id:"btc", label:"1 BTC", code:"BTC", btc:1},
    {id:"mbtc",label:"1 mBTC",code:"mBTC",btc:1e-3},
    {id:"ksat",label:"1 Ksat",code:"Ksat",btc:1e-5},
    {id:"ubtc",label:"1 μBTC",code:"μBTC",btc:1e-6},
    {id:"sat", label:"1 sat", code:"sat", btc:1e-8},
    {id:"msat",label:"1 msat",code:"msat",btc:1e-11},
    {id:"usat",label:"1 μsat",code:"μsat",btc:1e-14,displayOnly:true}
  ]);

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function value(pricePerBtc,unit){
    const p=finite(pricePerBtc);
    return Number.isFinite(p)?p*unit.btc:NaN;
  }

  function bestBtcUnit(btcAmount){
    const a=Math.abs(finite(btcAmount));
    if(!Number.isFinite(a))return null;

    const candidates=[
      {label:"kBTC",factor:1e-3},
      {label:"BTC",factor:1},
      {label:"mBTC",factor:1e3},
      {label:"Ksat",factor:1e5},
      {label:"μBTC",factor:1e6},
      {label:"sat",factor:1e8},
      {label:"msat",factor:1e11},
      {label:"μsat",factor:1e14}
    ];

    for(const c of candidates){
      const v=a*c.factor;
      if(v>=1&&v<1000000)return {label:c.label,value:btcAmount*c.factor};
    }

    const last=candidates[candidates.length-1];
    return {label:last.label,value:btcAmount*last.factor};
  }

  W.ZZXBitcoinTickerUnits=Object.freeze({__version:7,units,value,bestBtcUnit});
})();
