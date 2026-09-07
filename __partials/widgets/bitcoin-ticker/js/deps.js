(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerDeps?.__version>=6)return;
  const inflight=new Map();
  const resolve=path=>W.ZZXAPI?.url?W.ZZXAPI.url(path):path;

  function loadScript(path,test){
    if(test())return Promise.resolve();
    const url=resolve(path);
    if(inflight.has(url))return inflight.get(url);

    const promise=new Promise((done,fail)=>{
      const target=new URL(url,location.href).href;
      const existing=[...D.scripts].find(s=>s.src===target);

      if(existing){
        let attempts=0;
        const poll=()=>{
          if(test())return done();
          if(++attempts>400)return fail(new Error(`${path} did not register expected global`));
          W.setTimeout(poll,25);
        };
        poll();
        return;
      }

      const s=D.createElement("script");
      s.src=url;s.defer=true;
      s.addEventListener("load",()=>test()?done():fail(new Error(`${path} loaded without expected global`)),{once:true});
      s.addEventListener("error",()=>fail(new Error(`failed to load ${path}`)),{once:true});
      (D.head||D.documentElement).appendChild(s);
    }).finally(()=>inflight.delete(url));

    inflight.set(url,promise);
    return promise;
  }

  async function ensureShared(){
    await Promise.all([
      loadScript(W.ZZXBitcoinTickerConstants.sharedFxPath,()=>!!W.ZZXFX),
      loadScript(W.ZZXBitcoinTickerConstants.sharedChainPath,()=>!!W.ZZXChain),
      loadScript(W.ZZXBitcoinTickerConstants.sharedLiveBpiPath,()=>!!W.ZZXLiveBPI)
    ]);

    if(!W.ZZXFX?.rate)throw new Error("ZZXFX dependency unavailable");
    if(!W.ZZXChain?.tipHeight||!W.ZZXChain?.issuedSatsAtHeight)throw new Error("ZZXChain dependency unavailable");
    if(!W.ZZXLiveBPI?.start||!W.ZZXLiveBPI?.snapshot)throw new Error("ZZXLiveBPI dependency unavailable");
  }

  W.ZZXBitcoinTickerDeps=Object.freeze({__version:6,ensureShared});
})();
