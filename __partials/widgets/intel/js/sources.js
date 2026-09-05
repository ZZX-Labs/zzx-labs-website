// __partials/widgets/intel/js/sources.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXIntelSources?.__version >= 1) return;

  const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

  const SOURCES = Object.freeze([
    {
      id:"hn",
      label:"HN",
      type:"hn",
      query:"bitcoin OR lightning OR mempool OR satoshi"
    },
    {
      id:"ap",
      label:"AP",
      type:"rss",
      url:"https://apnews.com/hub/bitcoin?rss=1"
    },
    {
      id:"wired",
      label:"WIRED",
      type:"rss",
      url:"https://www.wired.com/feed/tag/cryptocurrency/latest/rss"
    },
    {
      id:"ars",
      label:"ARS",
      type:"rss",
      url:"https://feeds.arstechnica.com/arstechnica/technology-lab"
    },
    {
      id:"404",
      label:"404",
      type:"rss",
      url:"https://www.404media.co/rss/"
    }
  ]);

  const cache = new Map();
  const inflight = new Map();

  async function fetchRaw(url, mode) {
    const external = /^https?:\/\//i.test(url);

    if (W.ZZXAPI?.fetchRaw) {
      const r = await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:external ? "omit" : "same-origin",
        timeoutMs:15000,
        retries:1,
        retryDelayMs:450
      });

      return mode === "text" ? await r.text() : await r.json();
    }

    const r = await fetch(url,{
      cache:"no-store",
      credentials:external ? "omit" : "same-origin"
    });

    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return mode === "text" ? await r.text() : await r.json();
  }

  async function cached(key, ttl, loader, force=false) {
    const now = Date.now();
    const hit = cache.get(key);

    if (!force && hit && now-hit.at < ttl) return hit.value;
    if (inflight.has(key)) return await inflight.get(key);

    const promise = Promise.resolve()
      .then(loader)
      .then(value => {
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

    const rows = Array.from(doc.querySelectorAll("item, entry")).slice(0,20);
    const out = [];

    for (const item of rows) {
      const title = (
        item.querySelector("title")?.textContent || ""
      ).trim();

      let url = (
        item.querySelector("link")?.getAttribute("href") ||
        item.querySelector("link")?.textContent ||
        ""
      ).trim();

      const dateText = (
        item.querySelector("pubDate")?.textContent ||
        item.querySelector("published")?.textContent ||
        item.querySelector("updated")?.textContent ||
        ""
      ).trim();

      if (!title || !url) continue;

      out.push({
        id:`${source.id}:${url}`,
        source:source.label,
        title,
        url,
        ts:Date.parse(dateText) || 0,
        detail:new URL(url,location.href).hostname.replace(/^www\./,"")
      });
    }

    return out;
  }

  async function loadRSS(source, force=false) {
    return await cached(`rss:${source.id}`,60000,async()=>{
      let text;
      let route = "direct";

      try {
        text = await fetchRaw(source.url,"text");
      } catch (directError) {
        route = "proxy fallback";
        text = await fetchRaw(
          ALLORIGINS_RAW + encodeURIComponent(source.url),
          "text"
        );
      }

      return {
        items:parseRSS(text,source),
        route
      };
    },force);
  }

  async function loadHN(source, force=false) {
    return await cached("hn",60000,async()=>{
      const url =
        "https://hn.algolia.com/api/v1/search?" +
        new URLSearchParams({
          query:source.query,
          tags:"story",
          hitsPerPage:"12"
        }).toString();

      const data = await fetchRaw(url,"json");
      const hits = Array.isArray(data?.hits) ? data.hits : [];

      return {
        route:"direct",
        items:hits.slice(0,12).map(hit=>({
          id:`hn:${hit?.objectID || ""}`,
          source:source.label,
          title:hit?.title || hit?.story_title || "discussion",
          url:hit?.url || hit?.story_url || `https://news.ycombinator.com/item?id=${hit?.objectID}`,
          ts:Number(hit?.created_at_i || 0)*1000,
          detail:`${Number(hit?.points || 0).toLocaleString()} points · ${Number(hit?.num_comments || 0).toLocaleString()} comments`
        })).filter(item=>item.title && item.url)
      };
    },force);
  }

  async function load(source, force=false) {
    if (!source) throw new Error("missing source");
    return source.type === "hn"
      ? await loadHN(source,force)
      : await loadRSS(source,force);
  }

  W.ZZXIntelSources = Object.freeze({
    __version:1,
    SOURCES,
    load
  });
})();
