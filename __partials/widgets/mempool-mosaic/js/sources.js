(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicSources?.__version>=5)return;

  const normalize=value=>String(value||"").trim().replace(/\/+$/g,"");
  const join=(base,path)=>normalize(base)+"/"+String(path||"").replace(/^\/+/,"");
  const unique=rows=>[...new Set(rows.map(normalize).filter(Boolean))];

  function apiBases(core){
    return unique([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ]);
  }

  function websocketUrl(base){
    const raw=normalize(base);
    try{
      const u=new URL(raw,W.location.href);
      u.protocol=u.protocol==="https:"?"wss:":u.protocol==="http:"?"ws:":u.protocol;
      let path=u.pathname.replace(/\/+$/g,"");
      if(/\/api\/v1$/i.test(path))path+="/ws";
      else if(/\/api$/i.test(path))path+="/v1/ws";
      else if(!/\/v1\/ws$/i.test(path))path+="/api/v1/ws";
      u.pathname=path;u.search="";u.hash="";
      return u.toString();
    }catch(_){return raw.replace(/^http/i,"ws")+"/v1/ws"}
  }

  function websocketUrls(core){
    return unique([
      core?.ctx?.api?.MEMPOOL_WS,
      core?.ctx?.api?.MEMPOOL_WEBSOCKET,
      W.ZZX?.api?.MEMPOOL_WS,
      W.ZZX?.API?.MEMPOOL_WS,
      ...apiBases(core).map(websocketUrl),
      "wss://mempool.space/api/v1/ws"
    ]);
  }

  function fullFeedUrls(core){
    // Optional only. Never manufacture same-origin routes that may 404/stall.
    return unique([
      core?.ctx?.api?.MEMPOOL_FULL,
      core?.ctx?.api?.MEMPOOL_TXS,
      W.ZZX?.api?.MEMPOOL_FULL,
      W.ZZX?.api?.MEMPOOL_TXS,
      W.ZZX?.API?.MEMPOOL_FULL,
      W.ZZX?.API?.MEMPOOL_TXS
    ]);
  }

  function configForBase(core,base){
    const apiBase=normalize(base||apiBases(core)[0]||"https://mempool.space/api");
    return Object.freeze({
      apiBase,
      apiBases:apiBases(core),
      websocketUrls:websocketUrls(core),
      refreshMs:10000,
      reconnectMaxMs:30000,
      animationMs:560,
      shuffleMs:7200,
      renderDebounceMs:90,
      targetVbytes:1_000_000,
      maxTiles:6000,
      endpoints:{
        mempool:join(apiBase,"mempool"),
        blocks:join(apiBase,"v1/fees/mempool-blocks"),
        recommended:join(apiBase,"v1/fees/recommended"),
        tipHeight:join(apiBase,"blocks/tip/height"),
        recent:join(apiBase,"mempool/recent"),
        tx:join(apiBase,"tx/{txid}"),
        txHex:join(apiBase,"tx/{txid}/hex"),
        block:join(apiBase,"block/{hash}")
      },
      fullFeedUrls:fullFeedUrls(core),
      price:W.ZZXAPI?.url?W.ZZXAPI.url("/bitcoin/bpi/api/latest.json"):"/bitcoin/bpi/api/latest.json"
    });
  }

  function get(core,baseOverride=""){
    return configForBase(core,baseOverride||apiBases(core)[0]||"https://mempool.space/api");
  }

  W.ZZXMempoolMosaicSources=Object.freeze({__version:5,get,apiBases,configForBase,websocketUrl,websocketUrls,fullFeedUrls});
})();
