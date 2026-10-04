(function(){
  "use strict";
  const W=window;
  if(W.ZZXIChingProvider?.__version>=3)return;

  function normalizeSpot(value){
    const direct=Number(value);
    if(Number.isFinite(direct)&&direct>0)return {price:direct,source:"ZZXFX.btcPriceUsd()"};
    const nested=Number(value?.price??value?.price_usd??value?.usd);
    if(Number.isFinite(nested)&&nested>0)return {price:nested,source:String(value?.source||"ZZXFX.btcPriceUsd()")};
    throw new Error("invalid BTC/USD spot value");
  }

  async function currentPrice(){
    await W.ZZXIChingDeps.ensureShared();
    return normalizeSpot(await W.ZZXFX.btcPriceUsd());
  }

  async function historicalPrice(date,force=false){
    await W.ZZXIChingDeps.ensureShared();
    if(!force){
      const cached=W.ZZXIChingStorage.getCachedPrice(date);
      if(cached)return {price:cached.price,source:`${cached.source} · local cache`,cached:true};
    }
    const raw=await W.ZZXChain.historicalPriceUsd(date,!!force);
    const price=Number(raw?.price??raw?.price_usd??raw?.usd??raw);
    if(!(Number.isFinite(price)&&price>0))throw new Error("historical provider returned invalid BTC/USD");
    const result={price,source:String(raw?.source||"ZZXChain.historicalPriceUsd()"),cached:false};
    W.ZZXIChingStorage.setCachedPrice(date,result);
    return result;
  }

  W.ZZXIChingProvider=Object.freeze({__version:3,currentPrice,historicalPrice});
})();
