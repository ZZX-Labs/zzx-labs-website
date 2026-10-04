// __partials/widgets/btc-news/js/sources.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBTCNewsSources?.__version >= 2) return;

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const SOURCES = Object.freeze([
    {
      id:"hn",
      label:"HN",
      type:"hn",
      query:"bitcoin OR satoshi OR lightning OR bips"
    },
    {
      id:"coindesk",
      label:"CoinDesk",
      type:"rss",
      url:"https://www.coindesk.com/arc/outboundfeeds/rss/"
    },
    {
      id:"bitcoinmag",
      label:"Bitcoin Magazine",
      type:"rss",
      url:"https://bitcoinmagazine.com/.rss/full/"
    }
  ]);

  const cache = new Map();
  const inflight = new Map();

  function bitcoinHeadline(title) {
    return /bitcoin|btc|satoshi|lightning|bip|taproot|mempool|miner|halving|ordinals|ln\b/i.test(String(title || ""));
  }

  async function fetchRaw(url, mode) {
    const external = /^https?:\/\//i.test(url);

    if (W.ZZXAPI?.fetchRaw) {
      const r = await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:external ? "omit" : "same-origin",
        timeoutMs:12000,
        retries:1,
        retryDelayMs:450
      });
      return mode === "text" ? await r.text() : await r.json();
    }

    const r = await fetch(url,{
      cache:"no-store",
      credentials:external ? "omit" : "same-origin"
    });

    if (!r.ok) {
      const error = new Error(`HTTP ${r.status} ${url}`);
      error.status = r.status;
      throw error;
    }

    return mode === "text" ? await r.text() : await r.json();
  }

  async function cached(key, ttl, loader, force=false) {
    const hit = cache.get(key);

    if (!force && hit && Date.now()-hit.at < ttl) return hit.value;
    if (inflight.has(key)) return await inflight.get(key);

    const promise = Promise.resolve()
      .then(loader)
      .then(value=>{
        cache.set(key,{at:Date.now(),value});
        return value;
      })
      .finally(()=>inflight.delete(key));

    inflight.set(key,promise);
    return await promise;
  }

  function parseRSS(xml, source) {
    const doc = new DOMParser().parseFromString(String(xml || ""),"text/xml");
    if (doc.querySelector("parsererror")) throw new Error(`${source.label} RSS parse failed`);

    const rows = Array.from(doc.querySelectorAll("item,entry")).slice(0,30);
    const out=[];

    for (const row of rows) {
      const title=(row.querySelector("title")?.textContent || "").trim();
      const url=(
        row.querySelector("link")?.getAttribute("href") ||
        row.querySelector("link")?.textContent ||
        ""
      ).trim();

      const dateText=(
        row.querySelector("pubDate")?.textContent ||
        row.querySelector("published")?.textContent ||
        row.querySelector("updated")?.textContent ||
        ""
      ).trim();

      if (!title || !url || !bitcoinHeadline(title)) continue;

      out.push({
        id:`${source.id}:${url}`,
        source:source.label,
        title,
        url,
        ts:Date.parse(dateText) || 0,
        detail:new URL(url,location.href).hostname.replace(/^www\./,"")
      });
    }

    return out.slice(0,16);
  }

  async function loadRSS(source, force=false) {
    return await cached(`rss:${source.id}`,60000,async()=>{
      let xml;
      let route="direct";

      try {
        xml=await fetchRaw(source.url,"text");
      } catch (error) {
        if (Number(error?.status) >= 400) throw error;
        route="proxy fallback";
        xml=await fetchRaw(AO_RAW+encodeURIComponent(source.url),"text");
      }

      return {
        items:parseRSS(xml,source),
        route
      };
    },force);
  }

  async function loadHN(source, force=false) {
    return await cached("hn",60000,async()=>{
      const url=
        "https://hn.algolia.com/api/v1/search?" +
        new URLSearchParams({
          query:source.query,
          tags:"story",
          hitsPerPage:"16"
        }).toString();

      const data=await fetchRaw(url,"json");
      const hits=Array.isArray(data?.hits) ? data.hits : [];

      return {
        route:"direct",
        items:hits.slice(0,16).map(hit=>({
          id:`hn:${hit?.objectID || ""}`,
          source:source.label,
          title:hit?.title || hit?.story_title || "discussion",
          url:hit?.url || hit?.story_url || `https://news.ycombinator.com/item?id=${hit?.objectID}`,
          ts:Number(hit?.created_at_i || 0)*1000,
          detail:`${Number(hit?.points || 0).toLocaleString()} points · ${Number(hit?.num_comments || 0).toLocaleString()} comments`
        })).filter(item=>bitcoinHeadline(item.title) && item.url)
      };
    },force);
  }

  async function load(source, force=false) {
    return source?.type === "hn"
      ? await loadHN(source,force)
      : await loadRSS(source,force);
  }

  W.ZZXBTCNewsSources = Object.freeze({
    __version:2,
    SOURCES,
    bitcoinHeadline,
    load
  });
})();
