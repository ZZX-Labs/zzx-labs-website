(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerUnits?.__version>=5)return;

  const units=Object.freeze([
    {id:"kbtc",label:"1 kBTC",btc:1000},
    {id:"btc",label:"1 BTC",btc:1},
    {id:"mbtc",label:"1 mBTC",btc:1e-3},
    {id:"ubtc",label:"1 μBTC",btc:1e-6},
    {id:"sat",label:"1 sat",btc:1e-8},
    {id:"msat",label:"1 msat",btc:1e-11},
    {id:"usat",label:"1 μsat",btc:1e-14,displayOnly:true}
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

  W.ZZXBitcoinTickerUnits=Object.freeze({__version:5,units,value,bestBtcUnit});
})();
