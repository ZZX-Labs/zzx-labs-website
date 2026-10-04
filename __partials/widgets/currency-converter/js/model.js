(function(){
  "use strict";
  const W=window;
  if(W.ZZXCurrencyConverterModel?.__version>=3)return;

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  };

  function requireAsset(asset,label){
    if(!asset){
      throw new Error(
        `${label} unit unavailable`
      );
    }

    if(asset.available===false){
      throw new Error(
        `${asset.name||asset.code||label} reference unavailable`
      );
    }

    const usd=finite(asset.usdPerUnit);

    if(!(usd>0)){
      throw new Error(
        `${asset.name||asset.code||label} USD reference unavailable`
      );
    }

    return usd;
  }

  function convert(amount,from,to){
    const n=finite(amount);

    if(!Number.isFinite(n)||n<0){
      throw new Error(
        "Enter a valid non-negative amount."
      );
    }

    const fromUsd=requireAsset(from,"from");
    const toUsd=requireAsset(to,"to");

    const usdValue=n*fromUsd;
    const output=usdValue/toUsd;

    if(
      !Number.isFinite(usdValue) ||
      !Number.isFinite(output)
    ){
      throw new Error(
        "Non-finite conversion result."
      );
    }

    return {
      amount:n,
      usdValue,
      output,
      fromUsdPerUnit:fromUsd,
      toUsdPerUnit:toUsd,
      unitRate:fromUsd/toUsd
    };
  }

  function homeEquivalent(usdValue,home){
    const homeUsd=requireAsset(
      home,
      "home"
    );

    return finite(usdValue)/homeUsd;
  }

  function btcEquivalent(usdValue,btcUsd){
    const price=finite(btcUsd);

    return price>0
      ? finite(usdValue)/price
      : NaN;
  }

  function denominations(btcValue){
    const btc=finite(btcValue);

    if(!Number.isFinite(btc)){
      return [];
    }

    return W.ZZXCurrencyConverterData.btcUnits.map(
      unit=>({
        ...unit,
        value:btc/unit.btcFactor
      })
    );
  }

  W.ZZXCurrencyConverterModel=Object.freeze({
    __version:3,
    convert,
    homeEquivalent,
    btcEquivalent,
    denominations
  });
})();
