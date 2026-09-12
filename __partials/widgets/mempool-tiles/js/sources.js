// __partials/widgets/mempool-tiles/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesSources?.__version>=2)return;

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

  function websocketUrls(core){
    const base=apiBase(core);

    const configured=[
      core?.ctx?.api?.MEMPOOL_WS,
      core?.ctx?.api?.MEMPOOL_WEBSOCKET,
      W.ZZX?.api?.MEMPOOL_WS,
      W.ZZX?.API?.MEMPOOL_WS
    ]
      .map(value=>String(value||"").trim())
      .filter(Boolean);

    /*
     * A local REST mirror frequently does not proxy mempool.space's websocket.
     * Keep the derived local URL first, then fall back to the public projection
     * stream instead of leaving Tiles stuck on a ten-transaction recent sample.
     */
    return [...new Set([
      ...configured,
      websocketUrl(base),
      "wss://mempool.space/api/v1/ws"
    ])];
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
      "/bitcoin/mempool/api/full.json",
      "/bitcoin/mempool/api/mempool-full.json",
      "/bitcoin/mempool/data/full.json"
    ]
      .map(value=>String(value||"").trim())
      .filter(Boolean);

    return [...new Set(rows)];
  }

  function get(core){
    const base=apiBase(core);

    return {
      apiBase:base,
      refreshMs:10000,
      liveDebounceMs:180,
      liveReconnectMaxMs:30000,

      // Hydrate candidate details aggressively once exact live membership exists.
      hydrateBatch:36,
      hydrateConcurrency:8,
      hydrateDelayMs:650,

      // REST-only fallback progressively resolves the txid universe until it can
      // build a plausible 1-vMB candidate set. It is never labelled authoritative.
      fallbackHydrateBatch:96,
      fallbackHydrateConcurrency:10,
      fallbackHydrateDelayMs:420,
      maxHydratePerSession:6000,

      websocketUrls:websocketUrls(core),

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
    __version:2,
    get,
    apiBase,
    websocketUrl,
    websocketUrls,
    fullFeedUrls
  });
})();
