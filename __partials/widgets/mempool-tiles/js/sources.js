// __partials/widgets/mempool-tiles/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesSources?.__version>=1)return;

  const normalize=value=>String(value||"").trim().replace(/\/+$/g,"");
  const join=(base,path)=>normalize(base)+"/"+String(path||"").replace(/^\/+/,"");

  function websocketUrl(base){
    const raw=normalize(base);
    try{
      const url=new URL(raw,W.location.href);
      url.protocol=url.protocol==="https:"?"wss:":"ws:";
      url.pathname=url.pathname.replace(/\/+$/g,"")+"/v1/ws";
      url.search="";
      url.hash="";
      return url.toString();
    }catch(_){
      return raw.replace(/^http/i,"ws")+"/v1/ws";
    }
  }

  function apiBase(core){
    return normalize(
      core?.ctx?.api?.MEMPOOL ||
      core?.ctx?.api?.MEMPOOL_API ||
      W.ZZX?.api?.MEMPOOL ||
      W.ZZX?.api?.MEMPOOL_API ||
      W.ZZX?.API?.MEMPOOL ||
      W.ZZX?.API?.MEMPOOL_API ||
      "https://mempool.space/api"
    );
  }

  function fullFeedUrls(core){
    const rows=[
      core?.ctx?.api?.MEMPOOL_FULL,
      core?.ctx?.api?.MEMPOOL_TXS,
      core?.ctx?.api?.BITCOIN_MEMPOOL_VERBOSE,
      W.ZZX?.api?.MEMPOOL_FULL,
      W.ZZX?.api?.MEMPOOL_TXS,
      W.ZZX?.API?.MEMPOOL_FULL,
      W.ZZX?.API?.MEMPOOL_TXS,
      "/bitcoin/mempool/api/full.json"
    ].map(v=>String(v||"").trim()).filter(Boolean);

    return [...new Set(rows)];
  }

  function get(core){
    const base=apiBase(core);

    return {
      apiBase:base,
      refreshMs:10000,
      hydrateBatch:28,
      hydrateConcurrency:6,
      hydrateDelayMs:850,
      maxHydratePerSession:4800,
      websocket:websocketUrl(base),
      endpoints:{
        mempool:join(base,"mempool"),
        blocks:join(base,"v1/fees/mempool-blocks"),
        recommended:join(base,"v1/fees/recommended"),
        tipHeight:join(base,"blocks/tip/height"),
        txids:join(base,"mempool/txids"),
        recent:join(base,"mempool/recent"),
        tx:join(base,"tx/{txid}"),
        txHex:join(base,"tx/{txid}/hex"),
        block:join(base,"block/{hash}")
      },
      fullFeedUrls:fullFeedUrls(core),
      price:W.ZZXAPI?.url
        ? W.ZZXAPI.url("/bitcoin/bpi/api/latest.json")
        : "/bitcoin/bpi/api/latest.json"
    };
  }

  W.ZZXMempoolTilesSources=Object.freeze({
    __version:1,
    get,
    apiBase,
    websocketUrl,
    fullFeedUrls
  });
})();
