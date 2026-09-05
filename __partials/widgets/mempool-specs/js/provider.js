// __partials/widgets/mempool-specs/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsProvider?.__version>=3)return;

  async function j(url,opts={}){
    return (await W.ZZXMempoolSpecsFetch.fetchJSON(url,opts)).json;
  }

  async function t(url,opts={}){
    return (await W.ZZXMempoolSpecsFetch.fetchText(url,opts)).text;
  }

  async function price(url){
    try{
      const data=await j(url,{allowProxy:false});
      const value=Number(
        data?.price_usd ??
        data?.bpi_usd ??
        data?.vwap_usd
      );
      return {
        value:Number.isFinite(value)&&value>0?value:NaN,
        source:data?.source||"ZZX Global BPI"
      };
    }catch(_){
      return {value:NaN,source:"price unavailable"};
    }
  }

  async function load(core,{signal}={}){
    const cfg=W.ZZXMempoolSpecsSources.get(core);

    const [mempoolResult,blocksResult,recentResult,tipResult,priceResult]=
      await Promise.allSettled([
        j(cfg.endpoints.mempool,{signal}),
        j(cfg.endpoints.blocks,{signal}),
        j(cfg.endpoints.recent,{signal}),
        W.ZZXChain?.tipHeight
          ? W.ZZXChain.tipHeight(false)
          : t(cfg.endpoints.tipHeight,{signal}),
        price(cfg.price)
      ]);

    if(mempoolResult.status!=="fulfilled" && blocksResult.status!=="fulfilled"){
      throw mempoolResult.reason || blocksResult.reason || new Error("mempool data unavailable");
    }

    let tipHeight=NaN;

    if(tipResult.status==="fulfilled"){
      const value=
        typeof tipResult.value==="object"
          ? tipResult.value?.height
          : tipResult.value;
      tipHeight=Number(String(value).trim());
    }

    return {
      cfg,
      mempool:mempoolResult.status==="fulfilled"?mempoolResult.value:null,
      blocks:blocksResult.status==="fulfilled"&&Array.isArray(blocksResult.value)
        ? blocksResult.value
        : [],
      recent:recentResult.status==="fulfilled"&&Array.isArray(recentResult.value)
        ? recentResult.value
        : [],
      tipHeight:Number.isFinite(tipHeight)?tipHeight:NaN,
      priceUsd:priceResult.status==="fulfilled"?priceResult.value.value:NaN,
      priceSource:priceResult.status==="fulfilled"?priceResult.value.source:"price unavailable",
      fetchedAt:Date.now()
    };
  }

  W.ZZXMempoolSpecsProvider=Object.freeze({
    __version:3,
    load
  });
})();
