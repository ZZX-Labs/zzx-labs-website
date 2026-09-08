// __partials/widgets/mempool-mosaic/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicProvider?.__version>=1)return;

  function join(base,path){
    return String(base||"").replace(/\/+$/g,"")+"/"+String(path||"").replace(/^\/+/,"");
  }

  async function price(){
    try{
      const data=await W.ZZXMempoolMosaicFetch.json(
        W.ZZXMempoolMosaicSources.price,
        {local:true,allowProxy:false}
      );

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

  async function tip(base){
    if(W.ZZXChain?.tipHeight){
      try{
        const out=await W.ZZXChain.tipHeight(false);
        const value=Number(out?.height);
        if(Number.isFinite(value))return value;
      }catch(_){}
    }

    const raw=await fetch(join(base,"blocks/tip/height"),{
      cache:"no-store",
      credentials:"omit"
    });

    if(!raw.ok)throw new Error(`tip HTTP ${raw.status}`);
    const value=Number((await raw.text()).trim());
    if(!Number.isFinite(value))throw new Error("invalid tip height");
    return value;
  }

  async function load(core){
    let lastError=null;

    for(const base of W.ZZXMempoolMosaicSources.bases(core)){
      try{
        const [blocksResult,mempoolResult,tipResult,priceResult]=
          await Promise.allSettled([
            W.ZZXMempoolMosaicFetch.json(
              join(base,"v1/fees/mempool-blocks")
            ),
            W.ZZXMempoolMosaicFetch.json(
              join(base,"mempool")
            ),
            tip(base),
            price()
          ]);

        const blocks=
          blocksResult.status==="fulfilled"&&Array.isArray(blocksResult.value)
            ? blocksResult.value
            : [];

        const mempool=
          mempoolResult.status==="fulfilled"
            ? mempoolResult.value
            : null;

        if(!blocks.length&&!mempool){
          throw blocksResult.reason || mempoolResult.reason || new Error("candidate data unavailable");
        }

        return {
          base,
          source:blocks.length
            ? join(base,"v1/fees/mempool-blocks")
            : join(base,"mempool"),
          blocks,
          mempool,
          tipHeight:tipResult.status==="fulfilled"
            ? Number(tipResult.value)
            : NaN,
          priceUsd:priceResult.status==="fulfilled"
            ? Number(priceResult.value.value)
            : NaN,
          priceSource:priceResult.status==="fulfilled"
            ? priceResult.value.source
            : "price unavailable",
          fetchedAt:Date.now()
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("Mempool Mosaic data unavailable");
  }

  W.ZZXMempoolMosaicProvider=Object.freeze({
    __version:1,
    load
  });
})();
