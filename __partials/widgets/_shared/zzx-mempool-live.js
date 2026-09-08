(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolLive?.__version>=2)return;

  const EVENT="zzx:mempool-live:update";
  const state={
    core:null,
    snapshot:null,
    source:null,
    transport:null,
    fetchedAt:0,
    ws:null,
    wsUrl:null,
    wsIndex:0,
    reconnectTimer:null,
    reconnectAttempt:0,
    pollTimer:null,
    subscribers:new Set(),
    inflight:null,
    started:false,
    config:null
  };

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN;}
  function text(v){return String(v??"").trim();}
  function trimSlash(v){return text(v).replace(/\/+$/g,"");}
  function join(base,path){return trimSlash(base)+"/"+text(path).replace(/^\/+/,"");}
  function localUrl(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;}
  function unique(rows){return [...new Set(rows.map(trimSlash).filter(Boolean))];}

  function apiBases(core){
    return unique([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "/bitcoin/mempool/api",
      "https://mempool.space/api"
    ]);
  }

  function wsFromApi(base){
    const b=trimSlash(base);
    if(!b)return "";
    try{
      const u=new URL(b,W.location.href);
      const proto=u.protocol==="https:"?"wss:":u.protocol==="http:"?"ws:":u.protocol;
      let path=u.pathname.replace(/\/+$/g,"");
      if(/\/api$/i.test(path))path+="/v1/ws";
      else if(!/\/api\/v1$/i.test(path))path+="/api/v1/ws";
      else path+="/ws";
      return `${proto}//${u.host}${path}`;
    }catch(_){return "";}
  }

  function wsUrls(core){
    return unique(apiBases(core).map(wsFromApi));
  }

  async function fetchRaw(url,{local=false,timeoutMs=10000}={}){
    const target=local?localUrl(url):url;
    if(W.ZZXAPI?.fetchRaw){
      return await W.ZZXAPI.fetchRaw(target,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs,
        retries:1,
        retryDelayMs:350
      });
    }

    const controller=typeof AbortController==="function"?new AbortController():null;
    const timer=controller?W.setTimeout(()=>controller.abort(),timeoutMs):null;
    try{
      const r=await fetch(target,{
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        signal:controller?.signal
      });
      if(!r.ok){const e=new Error(`HTTP ${r.status} ${target}`);e.status=r.status;throw e;}
      return r;
    }finally{if(timer)W.clearTimeout(timer);}
  }

  async function json(url,opts={}){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(opts.local?localUrl(url):url,{
        cacheBust:!!opts.local,
        timeoutMs:opts.timeoutMs||10000,
        retries:1
      });
    }
    const r=await fetchRaw(url,opts);
    return await r.json();
  }

  async function textFetch(url,opts={}){
    const r=await fetchRaw(url,opts);
    return await r.text();
  }

  async function price(){
    try{
      const data=await json("/bitcoin/bpi/api/latest.json",{local:true});
      const value=finite(data?.price_usd??data?.bpi_usd??data?.vwap_usd??data?.price);
      return {value:Number.isFinite(value)&&value>0?value:NaN,source:text(data?.source)||"ZZX BPI"};
    }catch(_){return {value:NaN,source:"price unavailable"};}
  }

  async function tip(base){
    if(W.ZZXChain?.tipHeight){
      try{
        const out=await W.ZZXChain.tipHeight(false);
        const h=finite(out?.height??out);
        if(Number.isFinite(h))return h;
      }catch(_){ }
    }
    const raw=await textFetch(join(base,"blocks/tip/height"),{local:!/^https?:/i.test(base)});
    const h=finite(raw);
    if(!Number.isFinite(h))throw new Error("invalid tip height");
    return h;
  }

  function arrayAt(obj,names){
    for(const name of names){
      const v=obj?.[name];
      if(Array.isArray(v))return v;
    }
    return null;
  }

  function walk(obj,depth=0){
    if(!obj||typeof obj!=="object"||depth>5)return {blocks:null,transactions:null,mempool:null};
    const blocks=arrayAt(obj,["mempool-blocks","mempoolBlocks","projected-blocks","projectedBlocks"]);
    const transactions=arrayAt(obj,["mempool-block-transactions","mempoolBlockTransactions","transactions","txs"]);
    const mempool=obj["mempool-info"]??obj.mempoolInfo??obj.mempool??null;
    if(blocks||transactions||mempool)return {blocks,transactions,mempool};
    for(const v of Object.values(obj)){
      if(v&&typeof v==="object"&&!Array.isArray(v)){
        const hit=walk(v,depth+1);
        if(hit.blocks||hit.transactions||hit.mempool)return hit;
      }
    }
    return {blocks:null,transactions:null,mempool:null};
  }

  function extractMessage(payload){
    const msg=typeof payload==="string"?JSON.parse(payload):payload;
    if(!msg||typeof msg!=="object")return {blocks:null,transactions:null,mempool:null,raw:msg};
    const hit=walk(msg);
    return {...hit,raw:msg};
  }

  function merge(update={}){
    const prev=state.snapshot||{};
    const next={
      ...prev,
      ...update,
      blocks:Array.isArray(update.blocks)?update.blocks:(prev.blocks||[]),
      transactions:Array.isArray(update.transactions)?update.transactions:(prev.transactions||[]),
      mempool:update.mempool&&typeof update.mempool==="object"?update.mempool:(prev.mempool||null),
      fetchedAt:Date.now()
    };
    state.snapshot=Object.freeze(next);
    state.fetchedAt=next.fetchedAt;
    return state.snapshot;
  }

  function view(){
    return Object.freeze({
      snapshot:state.snapshot,
      source:state.source,
      transport:state.transport,
      fetchedAt:state.fetchedAt,
      wsUrl:state.wsUrl,
      connected:!!(state.ws&&state.ws.readyState===1)
    });
  }

  function publish(){
    const detail=view();
    W.ZZXMempoolLiveLatest=detail;
    try{W.dispatchEvent(new CustomEvent(EVENT,{detail}));}catch(_){ }
    for(const fn of state.subscribers){try{fn(detail);}catch(_){ }}
  }

  async function load(core=state.core,force=false){
    state.core=core||state.core||W.ZZXWidgetsCore||null;
    if(!force&&state.snapshot&&Date.now()-state.fetchedAt<8000)return view();
    if(state.inflight)return await state.inflight;

    state.inflight=(async()=>{
      let lastError=null;
      for(const base of apiBases(state.core)){
        const local=!/^https?:/i.test(base);
        try{
          const [blocksR,mempoolR,tipR,priceR]=await Promise.allSettled([
            json(join(base,"v1/fees/mempool-blocks"),{local}),
            json(join(base,"mempool"),{local}),
            tip(base),
            price()
          ]);
          const blocks=blocksR.status==="fulfilled"&&Array.isArray(blocksR.value)?blocksR.value:[];
          const mempool=mempoolR.status==="fulfilled"?mempoolR.value:null;
          if(!blocks.length&&!mempool)throw blocksR.reason||mempoolR.reason||new Error("mempool summary unavailable");
          state.source=base;
          state.transport=local?"local-rest":"rest";
          merge({
            base,
            blocks,
            mempool,
            tipHeight:tipR.status==="fulfilled"?finite(tipR.value):NaN,
            priceUsd:priceR.status==="fulfilled"?finite(priceR.value.value):NaN,
            priceSource:priceR.status==="fulfilled"?priceR.value.source:"price unavailable"
          });
          publish();
          return view();
        }catch(error){lastError=error;}
      }
      if(state.snapshot)return view();
      throw lastError||new Error("all mempool summary sources unavailable");
    })().finally(()=>{state.inflight=null;});

    return await state.inflight;
  }

  function sendTrack(ws){
    const messages=[
      {action:"want",data:["blocks","stats","mempool-blocks"]},
      {"track-mempool-block":0}
    ];
    for(const msg of messages){try{ws.send(JSON.stringify(msg));}catch(_){ }}
  }

  function clearReconnect(){if(state.reconnectTimer){W.clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}}

  function scheduleReconnect(){
    clearReconnect();
    if(!state.started||!state.subscribers.size)return;
    const wait=Math.min(30000,1000*Math.pow(1.7,Math.min(8,state.reconnectAttempt++)));
    state.reconnectTimer=W.setTimeout(()=>connect(),wait);
  }

  function closeSocket(){
    clearReconnect();
    if(state.ws){
      try{state.ws.onopen=state.ws.onmessage=state.ws.onerror=state.ws.onclose=null;state.ws.close();}catch(_){ }
    }
    state.ws=null;state.wsUrl=null;
  }

  function connect(){
    if(!state.started||!state.subscribers.size||typeof WebSocket!=="function")return;
    closeSocket();
    const urls=wsUrls(state.core);
    if(!urls.length)return;
    const index=state.wsIndex%urls.length;
    const url=urls[index];
    state.wsIndex=(index+1)%urls.length;
    state.wsUrl=url;

    let ws;
    try{ws=new WebSocket(url);}catch(_){scheduleReconnect();return;}
    state.ws=ws;

    ws.onopen=()=>{
      state.reconnectAttempt=0;
      state.transport="websocket";
      sendTrack(ws);
      publish();
    };

    ws.onmessage=event=>{
      let parsed;
      try{parsed=extractMessage(event.data);}catch(_){return;}
      const update={};
      if(Array.isArray(parsed.blocks))update.blocks=parsed.blocks;
      if(Array.isArray(parsed.transactions))update.transactions=parsed.transactions;
      if(parsed.mempool&&typeof parsed.mempool==="object")update.mempool=parsed.mempool;
      if(!Object.keys(update).length)return;
      state.source=url;
      state.transport="websocket";
      merge(update);
      publish();
    };

    ws.onerror=()=>{};
    ws.onclose=()=>{if(state.ws===ws)state.ws=null;scheduleReconnect();};
  }

  function schedulePoll(){
    if(state.pollTimer)W.clearTimeout(state.pollTimer);
    if(!state.started||!state.subscribers.size)return;
    state.pollTimer=W.setTimeout(async()=>{
      try{await load(state.core,true);}catch(_){ }
      schedulePoll();
    },10000);
  }

  function start(core){
    state.core=core||state.core||W.ZZXWidgetsCore||null;
    if(state.started)return;
    state.started=true;
    load(state.core,false).catch(()=>{});
    connect();
    schedulePoll();
  }

  function stop(){
    state.started=false;
    closeSocket();
    if(state.pollTimer){W.clearTimeout(state.pollTimer);state.pollTimer=null;}
  }

  function subscribe(core,fn,{immediate=true}={}){
    if(typeof fn!=="function")return ()=>{};
    state.subscribers.add(fn);
    start(core);
    if(immediate&&state.snapshot){try{fn(view());}catch(_){ }}
    return ()=>{
      state.subscribers.delete(fn);
      if(!state.subscribers.size)stop();
    };
  }

  function reconnect(core=state.core){
    state.core=core||state.core;
    state.wsIndex=0;
    state.reconnectAttempt=0;
    if(state.started)connect();
  }

  W.ZZXMempoolLive=Object.freeze({
    __version:2,
    EVENT,
    apiBases,
    wsUrls,
    extractMessage,
    load,
    subscribe,
    reconnect,
    current:view,
    json,
    text:textFetch
  });
})();
