(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinSupplyFetch?.__version>=1)return;

  const LOCAL_TIP="/bitcoin/mempool.space/api/blocks/tip/height";
  const PUBLIC_TIP="https://mempool.space/api/blocks/tip/height";
  const AO="https://api.allorigins.win/raw?url=";

  async function response(url){
    const target=W.ZZXAPI?.url&&!/^https?:/i.test(url)?W.ZZXAPI.url(url):url;
    const r=await fetch(target,{
      cache:"no-store",
      credentials:/^https?:/i.test(target)?"omit":"same-origin"
    });
    if(!r.ok){
      const error=new Error(`HTTP ${r.status}`);
      error.status=r.status;
      throw error;
    }
    return r;
  }

  function retryable(error){
    const s=Number(error?.status);
    return !Number.isFinite(s)||s===0||s===408||s===429||s>=500;
  }

  async function tipHeight(force=false){
    if(W.ZZXChain?.tipHeight){
      const result=await W.ZZXChain.tipHeight(force);
      const h=Number(result?.height??result);
      if(Number.isFinite(h)&&h>=0){
        return {height:Math.trunc(h),source:result?.source||"ZZXChain"};
      }
    }

    try{
      const local=await (await response(LOCAL_TIP)).text();
      const h=Number(String(local).trim());
      if(Number.isFinite(h)&&h>=0){
        return {height:Math.trunc(h),source:"ZZX local mempool mirror"};
      }
      throw new Error("invalid local block tip");
    }catch(localError){
      try{
        const direct=await (await response(PUBLIC_TIP)).text();
        const h=Number(String(direct).trim());
        if(!Number.isFinite(h)||h<0)throw new Error("invalid public block tip");
        return {height:Math.trunc(h),source:"mempool.space"};
      }catch(publicError){
        if(!retryable(publicError))throw publicError;
        const proxy=AO+encodeURIComponent(PUBLIC_TIP);
        const text=await (await response(proxy)).text();
        const h=Number(String(text).trim());
        if(!Number.isFinite(h)||h<0)throw new Error("invalid proxied block tip");
        return {height:Math.trunc(h),source:"mempool.space · AllOrigins fallback"};
      }
    }
  }

  W.ZZXBitcoinSupplyFetch=Object.freeze({__version:1,tipHeight});
})();
