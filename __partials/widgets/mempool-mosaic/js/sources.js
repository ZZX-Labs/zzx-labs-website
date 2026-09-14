(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicSources?.__version>=4)return;

  const normalize=value=>String(value||"").trim().replace(/\/+$/g,"");
  const join=(base,path)=>normalize(base)+"/"+String(path||"").replace(/^\/+/g,"");

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

  function websocketUrl(base){
    const raw=normalize(base);
    try{
      const u=new URL(raw,W.location.href);
      u.protocol=u.protocol==="https:"?"wss:":"ws:";
      u.pathname=u.pathname.replace(/\/+$/g,"")+"/v1/ws";
      u.search="";u.hash="";
      return u.toString();
    }catch(_){
      return raw.replace(/^http/i,"ws")+"/v1/ws";
    }
  }

  function fullFeedUrls(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL_FULL,
      core?.ctx?.api?.MEMPOOL_TXS,
      W.ZZX?.api?.MEMPOOL_FULL,
      W.ZZX?.api?.MEMPOOL_TXS,
      W.ZZX?.API?.MEMPOOL_FULL,
      W.ZZX?.API?.MEMPOOL_TXS,
      "/bitcoin/mempool/api/full.json"
    ].map(v=>String(v||"").trim()).filter(Boolean))];
  }

  function get(core){
    const base=apiBase(core);
    return Object.freeze({
      apiBase:base,
      websocket:websocketUrl(base),
      refreshMs:10000,
      reconnectMaxMs:30000,
      animationMs:560,
      shuffleMs:7200,
      renderDebounceMs:90,
      targetVbytes:1_000_000,
      maxTiles:6000,
      trackedBlockIndex:0,
      endpoints:Object.freeze({
        mempool:join(base,"mempool"),
        blocks:join(base,"v1/fees/mempool-blocks"),
        recommended:join(base,"v1/fees/recommended"),
        tipHeight:join(base,"blocks/tip/height"),
        recent:join(base,"mempool/recent"),
        txids:join(base,"mempool/txids"),
        tx:join(base,"tx/{txid}"),
        txHex:join(base,"tx/{txid}/hex"),
        block:join(base,"block/{hash}")
      }),
      fullFeedUrls:fullFeedUrls(core),
      price:W.ZZXAPI?.url?W.ZZXAPI.url("/bitcoin/bpi/api/latest.json"):"/bitcoin/bpi/api/latest.json"
    });
  }

  W.ZZXMempoolMosaicSources=Object.freeze({__version:4,get,apiBase,websocketUrl,fullFeedUrls});
})();
