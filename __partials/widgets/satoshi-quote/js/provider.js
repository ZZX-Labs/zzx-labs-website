// __partials/widgets/satoshi-quote/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXSatoshiQuoteProvider?.__version>=3)return;

  async function load(core){
    const path=W.ZZXSatoshiQuoteSources.corpus;

    const url=core?.ctx?.urlFor
      ? core.ctx.urlFor(path)
      : W.ZZXAPI?.url
        ? W.ZZXAPI.url(path)
        : path;

    let data;

    if(W.ZZXAPI?.jsonStrict){
      data=await W.ZZXAPI.jsonStrict(url,{
        cacheBust:false,
        timeoutMs:8000,
        retries:1
      });
    }else if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cache:"no-store",
        credentials:"same-origin",
        timeoutMs:8000,
        retries:1
      });
      data=await r.json();
    }else{
      const r=await fetch(url,{
        cache:"no-store",
        credentials:"same-origin"
      });

      if(!r.ok)throw new Error(`quotes HTTP ${r.status}`);
      data=await r.json();
    }

    const items=W.ZZXSatoshiQuoteModel.normalize(data);

    if(!items.length){
      throw new Error("local Satoshi quote corpus is empty");
    }

    return {
      items,
      categories:W.ZZXSatoshiQuoteModel.categories(items),
      source:path,
      loadedAt:Date.now()
    };
  }

  W.ZZXSatoshiQuoteProvider=Object.freeze({
    __version:3,
    load
  });
})();
