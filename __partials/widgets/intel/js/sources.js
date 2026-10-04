
// __partials/widgets/intel/js/sources.js
(function () {
  "use strict";

  const W=window;
  if(Number(W.ZZXIntelSources?.__version||0)>=2)return;

  const SOURCES=Object.freeze([
    {
      id:"hn",
      label:"HN",
      type:"hn",
      local:"/bitcoin/intel/api/news/hn.json",
      query:"bitcoin OR lightning OR mempool OR satoshi"
    },
    {
      id:"ap",
      label:"AP",
      type:"rss",
      local:"/bitcoin/intel/api/news/ap.json",
      url:"https://apnews.com/hub/bitcoin?rss=1"
    },
    {
      id:"wired",
      label:"WIRED",
      type:"rss",
      local:"/bitcoin/intel/api/news/wired.json",
      url:"https://www.wired.com/feed/tag/cryptocurrency/latest/rss"
    },
    {
      id:"ars",
      label:"ARS",
      type:"rss",
      local:"/bitcoin/intel/api/news/ars.json",
      url:"https://feeds.arstechnica.com/arstechnica/technology-lab"
    },
    {
      id:"404",
      label:"404",
      type:"rss",
      local:"/bitcoin/intel/api/news/404.json",
      url:"https://www.404media.co/rss/"
    }
  ]);

  const cache=new Map();
  const inflight=new Map();

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)?W.ZZXAPI.url(url):url;
  }

  async function raw(url,mode){
    const target=resolved(url);
    const external=/^https?:/i.test(target);

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:!external,
        cache:"no-store",
        credentials:external?"omit":"same-origin",
        timeoutMs:15000,
        retries:1,
        retryDelayMs:450
      });
      return mode==="text"?r.text():r.json();
    }

    const r=await fetch(target,{
      cache:"no-store",
      credentials:external?"omit":"same-origin"
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${target}`);
    return mode==="text"?r.text():r.json();
  }

  async function cached(key,ttl,loader,force=false){
    const hit=cache.get(key);
    if(!force&&hit&&Date.now()-hit.at<ttl)return hit.value;
    if(inflight.has(key))return inflight.get(key);

    const promise=Promise.resolve()
      .then(loader)
      .then(value=>{
        cache.set(key,{at:Date.now(),value});
        return value;
      })
      .finally(()=>inflight.delete(key));

    inflight.set(key,promise);
    return promise;
  }

  function normalizedMirror(payload,source){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.map(item=>({
      id:String(item.id||`${source.id}:${item.url||item.title||""}`),
      source:String(item.source||source.label),
      title:String(item.title||"source item"),
      url:String(item.url||""),
      ts:Number(item.ts||0),
      detail:String(item.detail||"")
    })).filter(item=>item.title&&item.url);
  }

  function parseRSS(xml,source){
    const doc=new DOMParser().parseFromString(String(xml||""),"text/xml");
    if(doc.querySelector("parsererror"))throw new Error(`${source.label} RSS parse failed`);

    return [...doc.querySelectorAll("item, entry")].slice(0,20).map(item=>{
      const title=(item.querySelector("title")?.textContent||"").trim();
      const linkNode=item.querySelector("link");
      const url=(linkNode?.getAttribute("href")||linkNode?.textContent||"").trim();
      const dateText=(
        item.querySelector("pubDate")?.textContent||
        item.querySelector("published")?.textContent||
        item.querySelector("updated")?.textContent||
        ""
      ).trim();

      let detail="";
      try{detail=new URL(url,location.href).hostname.replace(/^www\./,"")}
      catch(_){detail=source.label}

      return {
        id:`${source.id}:${url}`,
        source:source.label,
        title,
        url,
        ts:Date.parse(dateText)||0,
        detail
      };
    }).filter(item=>item.title&&item.url);
  }

  async function loadLocal(source){
    const payload=await raw(source.local,"json");
    return {
      items:normalizedMirror(payload,source),
      route:"local mirror"
    };
  }

  async function loadDirect(source){
    if(source.type==="hn"){
      const url="https://hn.algolia.com/api/v1/search?"+
        new URLSearchParams({
          query:source.query,
          tags:"story",
          hitsPerPage:"12"
        }).toString();

      const data=await raw(url,"json");
      const hits=Array.isArray(data?.hits)?data.hits:[];

      return {
        route:"direct HN",
        items:hits.slice(0,12).map(hit=>({
          id:`hn:${hit?.objectID||""}`,
          source:source.label,
          title:hit?.title||hit?.story_title||"discussion",
          url:hit?.url||hit?.story_url||`https://news.ycombinator.com/item?id=${hit?.objectID}`,
          ts:Number(hit?.created_at_i||0)*1000,
          detail:`${Number(hit?.points||0).toLocaleString()} points · ${Number(hit?.num_comments||0).toLocaleString()} comments`
        })).filter(item=>item.title&&item.url)
      };
    }

    const text=await raw(source.url,"text");
    return {
      route:"direct RSS",
      items:parseRSS(text,source)
    };
  }

  async function load(source,force=false){
    if(!source)throw new Error("missing source");

    return cached(`intel:${source.id}`,60000,async()=>{
      try{
        const result=await loadLocal(source);
        if(result.items.length)return result;
      }catch(_){}

      // No proxy service. Try the public source directly as a resilience path.
      return loadDirect(source);
    },force);
  }

  W.ZZXIntelSources=Object.freeze({
    __version:2,
    SOURCES,
    load
  });
})();
