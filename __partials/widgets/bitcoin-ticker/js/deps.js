(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerDeps?.__version>=7)return;

  const inflight=new Map();
  const resolve=path=>W.ZZXAPI?.url?W.ZZXAPI.url(path):path;

  function versionOK(globalName,minVersion){
    const value=W[globalName];
    if(!value)return false;
    if(!minVersion)return true;
    return Number(value.__version||0)>=Number(minVersion);
  }

  function freshURL(path,minVersion){
    const raw=resolve(path);

    try{
      const url=new URL(raw,W.location.href);
      if(minVersion){
        url.searchParams.set("zzxdep",String(minVersion));
      }
      return url.href;
    }catch(_){
      if(!minVersion)return raw;
      const sep=raw.includes("?")?"&":"?";
      return `${raw}${sep}zzxdep=${encodeURIComponent(minVersion)}`;
    }
  }

  function waitFor(globalName,minVersion,timeoutMs=1200){
    return new Promise((done,fail)=>{
      const started=Date.now();

      function poll(){
        if(versionOK(globalName,minVersion))return done();

        if(Date.now()-started>=timeoutMs){
          return fail(
            new Error(
              `${globalName} dependency global did not initialize`
            )
          );
        }

        W.setTimeout(poll,25);
      }

      poll();
    });
  }

  function inject(src,globalName,minVersion){
    return new Promise((done,fail)=>{
      const script=D.createElement("script");
      script.src=src;
      script.defer=true;
      script.setAttribute(
        "data-zzx-ticker-dependency",
        globalName
      );

      script.addEventListener("load",()=>{
        if(versionOK(globalName,minVersion)){
          done();
        }else{
          fail(
            new Error(
              `${src} loaded without compatible ${globalName}`
            )
          );
        }
      },{once:true});

      script.addEventListener(
        "error",
        ()=>fail(new Error(`failed to load ${src}`)),
        {once:true}
      );

      (D.head||D.documentElement).appendChild(script);
    });
  }

  function loadScript(path,globalName,minVersion){
    if(versionOK(globalName,minVersion)){
      return Promise.resolve();
    }

    const key=
      `${resolve(path)}::${globalName}::${minVersion||0}`;

    if(inflight.has(key))return inflight.get(key);

    const promise=(async()=>{
      const normal=new URL(
        resolve(path),
        W.location.href
      ).href;

      const existing=[...D.scripts].find(
        script=>script.src===normal
      );

      if(existing){
        try{
          await waitFor(globalName,minVersion,500);
          return;
        }catch(_){
          // Same-src dependency is stale/incompatible.
        }
      }

      const fresh=freshURL(path,minVersion);

      const existingFresh=[...D.scripts].find(
        script=>script.src===fresh
      );

      if(existingFresh){
        await waitFor(globalName,minVersion,1500);
        return;
      }

      await inject(fresh,globalName,minVersion);
    })().finally(()=>inflight.delete(key));

    inflight.set(key,promise);
    return promise;
  }

  async function ensureShared(){
    await Promise.all([
      loadScript(
        W.ZZXBitcoinTickerConstants.sharedFxPath,
        "ZZXFX"
      ),
      loadScript(
        W.ZZXBitcoinTickerConstants.sharedChainPath,
        "ZZXChain"
      ),
      loadScript(
        W.ZZXBitcoinTickerConstants.sharedLiveBpiPath,
        "ZZXLiveBPI",
        4
      )
    ]);

    if(!W.ZZXFX?.rate){
      throw new Error("ZZXFX dependency unavailable");
    }

    if(
      !W.ZZXChain?.tipHeight ||
      !W.ZZXChain?.issuedSatsAtHeight
    ){
      throw new Error("ZZXChain dependency unavailable");
    }

    if(
      Number(W.ZZXLiveBPI?.__version||0)<4 ||
      !W.ZZXLiveBPI?.start ||
      !W.ZZXLiveBPI?.snapshot ||
      !W.ZZXLiveBPI?.sanity
    ){
      throw new Error("ZZXLiveBPI v4 dependency unavailable");
    }
  }

  W.ZZXBitcoinTickerDeps=Object.freeze({
    __version:7,
    ensureShared
  });
})();
