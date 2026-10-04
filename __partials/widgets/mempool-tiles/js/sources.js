// __partials/widgets/mempool-tiles/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesSources?.__version>=4)return;

  const normalize=value=>String(value||"").trim().replace(/\/+$/g,"");
  const join=(base,path)=>normalize(base)+"/"+String(path||"").replace(/^\/+/ ,"");
  const unique=rows=>[...new Set(rows.map(normalize).filter(Boolean))];

  function configuredBases(core){
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

  function apiBases(core){
    const rows=configuredBases(core);
    return rows.length?rows:["https://mempool.space/api"];
  }

  function websocketUrl(base){
    const raw=normalize(base);
    try{
      const url=new URL(raw,W.location.href);
      url.protocol=url.protocol==="https:"?"wss:":url.protocol==="http:"?"ws:":url.protocol;
      let path=url.pathname.replace(/\/+$/g,"");
      if(/\/api\/v1$/i.test(path))path+="/ws";
      else if(/\/api$/i.test(path))path+="/v1/ws";
      else if(!/\/v1\/ws$/i.test(path))path+="/api/v1/ws";
      url.pathname=path;
      url.search="";
      url.hash="";
      return url.toString();
    }catch(_){
      return raw.replace(/^http/i,"ws")+"/v1/ws";
    }
  }

  function websocketUrls(core){
    const configured=[
      core?.ctx?.api?.MEMPOOL_WS,
      core?.ctx?.api?.MEMPOOL_WEBSOCKET,
      W.ZZX?.api?.MEMPOOL_WS,
      W.ZZX?.API?.MEMPOOL_WS
    ].map(value=>String(value||"").trim()).filter(Boolean);

    return unique([
      ...configured,
      ...apiBases(core).map(websocketUrl),
      "wss://mempool.space/api/v1/ws"
    ]);
  }

  function fullFeedUrls(core){
    // Full-feed endpoints are optional enrichment. Only explicitly configured
    // endpoints are probed; never manufacture same-origin URLs that may 404 or
    // stall the widget before the normal mempool REST path can run.
    return unique([
      core?.ctx?.api?.MEMPOOL_FULL,
      core?.ctx?.api?.MEMPOOL_TXS,
      core?.ctx?.api?.BITCOIN_MEMPOOL_VERBOSE,
      W.ZZX?.api?.MEMPOOL_FULL,
      W.ZZX?.api?.MEMPOOL_TXS,
      W.ZZX?.API?.MEMPOOL_FULL,
      W.ZZX?.API?.MEMPOOL_TXS
    ]);
  }

  function configForBase(core,base){
    const normalized=normalize(base||apiBases(core)[0]||"https://mempool.space/api");
    return {
      apiBase:normalized,
      apiBases:apiBases(core),
      refreshMs:10000,
      liveDebounceMs:180,
      liveReconnectMaxMs:30000,
      hydrateBatch:36,
      hydrateConcurrency:8,
      hydrateDelayMs:650,
      fallbackHydrateBatch:96,
      fallbackHydrateConcurrency:8,
      fallbackHydrateDelayMs:500,
      maxHydratePerSession:6000,
      websocketUrls:websocketUrls(core),
      endpoints:{
        mempool:join(normalized,"mempool"),
        blocks:join(normalized,"v1/fees/mempool-blocks"),
        recommended:join(normalized,"v1/fees/recommended"),
        tipHeight:join(normalized,"blocks/tip/height"),
        txids:join(normalized,"mempool/txids"),
        recent:join(normalized,"mempool/recent"),
        tx:join(normalized,"tx/{txid}"),
        txHex:join(normalized,"tx/{txid}/hex"),
        block:join(normalized,"block/{hash}")
      },
      fullFeedUrls:fullFeedUrls(core),
      price:W.ZZXAPI?.url
        ? W.ZZXAPI.url("/bitcoin/bpi/api/latest.json")
        : "/bitcoin/bpi/api/latest.json"
    };
  }

  function get(core,baseOverride=""){
    return configForBase(core,baseOverride||apiBases(core)[0]);
  }

  W.ZZXMempoolTilesSources=Object.freeze({
    __version:4,
    get,
    apiBases,
    configForBase,
    websocketUrl,
    websocketUrls,
    fullFeedUrls
  });
})();
