(function(){
  "use strict";
  const W=window;
  if(W.ZZXIChingStorage?.__version>=3)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function id(){
    if(W.crypto?.randomUUID)return W.crypto.randomUUID();
    if(W.crypto?.getRandomValues){
      const bytes=new Uint8Array(16);W.crypto.getRandomValues(bytes);
      return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
    }
    return `lot-${Date.now()}-${Math.trunc(W.performance?.now?.()||0)}`;
  }

  function cleanDate(value){
    const s=String(value||"").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return "";
    return Number.isFinite(Date.parse(`${s}T00:00:00Z`))?s:"";
  }

  function normalizeLot(lot){
    if(!lot||typeof lot!=="object")return null;
    const date=cleanDate(lot.date),usd=finite(lot.usd),historicalPrice=finite(lot.historicalPrice),btc=finite(lot.btc);
    if(!date||!(usd>0)||!(historicalPrice>0)||!(btc>0))return null;
    return {
      id:String(lot.id||id()),date,usd,historicalPrice,btc,
      source:String(lot.source||"unknown"),
      addedAt:String(lot.addedAt||new Date().toISOString())
    };
  }

  function normalizeLots(value){
    if(!Array.isArray(value))return [];
    const out=[],seen=new Set();
    for(const raw of value){
      const lot=normalizeLot(raw);
      if(!lot||seen.has(lot.id))continue;
      seen.add(lot.id);out.push(lot);
      if(out.length>=W.ZZXIChingConstants.maxLots)break;
    }
    return out;
  }

  function parseKey(key){
    try{return JSON.parse(W.localStorage.getItem(key)||"null")}
    catch(_){return null}
  }

  function save(lots){
    const clean=normalizeLots(lots);
    try{
      W.localStorage.setItem(W.ZZXIChingConstants.storageKey,JSON.stringify(clean));
      return {ok:true,lots:clean};
    }catch(error){
      return {ok:false,lots:clean,error:String(error?.message||error)};
    }
  }

  function load(){
    const current=normalizeLots(parseKey(W.ZZXIChingConstants.storageKey));
    if(current.length)return current;
    for(const key of W.ZZXIChingConstants.legacyStorageKeys){
      const legacy=normalizeLots(parseKey(key));
      if(legacy.length){save(legacy);return legacy}
    }
    return [];
  }

  function clear(){
    try{W.localStorage.removeItem(W.ZZXIChingConstants.storageKey);return true}
    catch(_){return false}
  }

  function loadPriceCache(){
    try{
      const parsed=JSON.parse(W.localStorage.getItem(W.ZZXIChingConstants.priceCacheKey)||"{}");
      return parsed&&typeof parsed==="object"?parsed:{};
    }catch(_){return {}}
  }

  function getCachedPrice(date){
    const row=loadPriceCache()[date];
    if(!row||!(finite(row.price)>0))return null;
    return {price:finite(row.price),source:String(row.source||"local cache"),cachedAt:String(row.cachedAt||"")};
  }

  function setCachedPrice(date,result){
    const price=finite(result?.price);
    if(!(price>0))return false;
    const cache=loadPriceCache();
    cache[date]={price,source:String(result?.source||"unknown"),cachedAt:new Date().toISOString()};
    const keys=Object.keys(cache).sort();
    while(keys.length>600)delete cache[keys.shift()];
    try{W.localStorage.setItem(W.ZZXIChingConstants.priceCacheKey,JSON.stringify(cache));return true}
    catch(_){return false}
  }

  W.ZZXIChingStorage=Object.freeze({
    __version:3,id,normalizeLot,normalizeLots,load,save,clear,getCachedPrice,setCachedPrice
  });
})();
