// __partials/widgets/tip/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTipProvider?.__version>=4)return;

  function join(base,path){
    return String(base||"").replace(/\/+$/g,"")+
      "/"+
      String(path||"").replace(/^\/+/,"");
  }

  async function fromSharedChain(){
    if(!W.ZZXChain?.tipHeight)return null;

    try{
      const out=await W.ZZXChain.tipHeight(false);
      const height=Number(out?.height);

      if(Number.isFinite(height)&&height>=0){
        return {
          height,
          source:"ZZXChain.tipHeight()",
          transport:"shared"
        };
      }
    }catch(_){}

    return null;
  }

  async function load(core){
    const shared=await fromSharedChain();
    if(shared)return shared;

    let lastError=null;

    for(const base of W.ZZXTipSources.bases(core)){
      try{
        const result=await W.ZZXTipFetch.text(
          join(base,"blocks/tip/height")
        );

        const height=Number(
          String(result.value||"").trim()
        );

        if(!Number.isFinite(height)||height<0){
          throw new Error("invalid tip height");
        }

        return {
          height,
          source:join(base,"blocks/tip/height"),
          transport:result.transport
        };
      }catch(error){
        lastError=error;
      }
    }

    throw lastError||new Error("all tip sources unavailable");
  }

  W.ZZXTipProvider=Object.freeze({
    __version:4,
    load
  });
})();
