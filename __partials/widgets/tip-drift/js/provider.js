// __partials/widgets/tip-drift/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTipDriftProvider?.__version>=4)return;

  function join(base,path){
    return String(base||"").replace(/\/+$/g,"")+
      "/"+
      String(path||"").replace(/^\/+/,"");
  }

  async function load(core){
    let lastError=null;

    for(const base of W.ZZXTipDriftSources.bases(core)){
      try{
        let height=NaN;
        let heightTransport="";

        if(W.ZZXChain?.tipHeight){
          try{
            const out=await W.ZZXChain.tipHeight(false);
            const value=Number(out?.height);
            if(Number.isFinite(value)){
              height=value;
              heightTransport="ZZXChain";
            }
          }catch(_){}
        }

        if(!Number.isFinite(height)){
          const heightResult=await W.ZZXTipDriftFetch.text(
            join(base,"blocks/tip/height")
          );

          height=Number(
            String(heightResult.value||"").trim()
          );

          heightTransport=heightResult.transport;
        }

        const blocksResult=await W.ZZXTipDriftFetch.json(
          join(base,"blocks")
        );

        const model=W.ZZXTipDriftModel.build(
          height,
          blocksResult.value
        );

        return {
          model,
          source:base,
          transport:
            heightTransport===blocksResult.transport
              ? blocksResult.transport
              : `${heightTransport}+${blocksResult.transport}`
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("all tip-drift sources unavailable");
  }

  W.ZZXTipDriftProvider=Object.freeze({
    __version:4,
    load
  });
})();
