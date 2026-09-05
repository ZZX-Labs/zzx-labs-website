// __partials/widgets/btc-intel/js/sources.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBTCIntelSources?.__version >= 1) return;

  const GH_API = "https://api.github.com";

  const REPOS = Object.freeze([
    { repo:"bitcoin/bitcoin", category:"protocol", label:"Core" },
    { repo:"bitcoin/bips", category:"protocol", label:"BIPs" },
    { repo:"lightning/bolts", category:"lightning", label:"BOLTs" },
    { repo:"lightningnetwork/lnd", category:"lightning", label:"LND" }
  ]);

  const HN_QUERY =
    "https://hn.algolia.com/api/v1/search?" +
    new URLSearchParams({
      query:"bitcoin OR satoshi OR lightning OR bips",
      tags:"story",
      hitsPerPage:"12"
    }).toString();

  const cache = new Map();
  const inflight = new Map();

  async function fetchJSON(url, options={}) {
    const local = !/^https?:\/\//i.test(url);

    if (W.ZZXAPI?.jsonStrict) {
      return await W.ZZXAPI.jsonStrict(url, {
        cacheBust:local,
        timeoutMs:10000,
        retries:1,
        ...options
      });
    }

    if (W.ZZXAPI?.fetchRaw) {
      const r = await W.ZZXAPI.fetchRaw(url, {
        cacheBust:local,
        cache:"no-store",
        credentials:local ? "same-origin" : "omit",
        timeoutMs:10000,
        retries:1,
        ...options
      });
      return await r.json();
    }

    const r = await fetch(url,{
      cache:"no-store",
      credentials:local ? "same-origin" : "omit"
    });

    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
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
      .finally(() => inflight.delete(key));

    inflight.set(key,promise);
    return await promise;
  }

  async function market(force=false) {
    return await cached("market",15000,async()=>{
      const data = await fetchJSON("/bitcoin/bpi/api/latest.json");
      return {
        data,
        source:data?.source || "ZZX Global BPI"
      };
    },force);
  }

  async function githubRepo(spec, force=false) {
    const key = `gh:${spec.repo}`;

    return await cached(key,60000,async()=>{
      const url = `${GH_API}/repos/${spec.repo}/commits?per_page=3`;
      const data = await fetchJSON(url);

      const rows = (Array.isArray(data) ? data : []).map(c => ({
        id:`gh:${spec.repo}:${c?.sha || ""}`,
        category:spec.category,
        source:spec.label,
        title:String(c?.commit?.message || "repository update").split("\n")[0].slice(0,150),
        detail:spec.repo,
        url:c?.html_url || `https://github.com/${spec.repo}`,
        ts:Date.parse(c?.commit?.author?.date || "") || 0
      }));

      return {
        items:rows,
        source:`GitHub ${spec.repo}`
      };
    },force);
  }

  async function discussion(force=false) {
    return await cached("hn",60000,async()=>{
      const data = await fetchJSON(HN_QUERY);
      const hits = Array.isArray(data?.hits) ? data.hits : [];

      return {
        items:hits.slice(0,10).map(h => ({
          id:`hn:${h?.objectID || ""}`,
          category:"discussion",
          source:"HN",
          title:h?.title || h?.story_title || "discussion",
          detail:`${Number(h?.points || 0).toLocaleString()} points · ${Number(h?.num_comments || 0).toLocaleString()} comments`,
          url:h?.url || h?.story_url || `https://news.ycombinator.com/item?id=${h?.objectID}`,
          ts:Number(h?.created_at_i || 0) * 1000
        })).filter(x => x.title && x.url),
        source:"Hacker News / Algolia"
      };
    },force);
  }

  async function feed(force=false) {
    const results = await Promise.allSettled([
      ...REPOS.map(spec => githubRepo(spec,force)),
      discussion(force)
    ]);

    const items = [];
    const liveSources = [];
    const failedSources = [];

    results.forEach((result,index)=>{
      if (result.status === "fulfilled") {
        liveSources.push(result.value.source);
        items.push(...(result.value.items || []));
      } else {
        failedSources.push(
          index < REPOS.length
            ? REPOS[index].label
            : "HN"
        );
      }
    });

    const seen = new Set();

    const unique = items
      .filter(item => {
        const key = item.id || `${item.source}:${item.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a,b)=>(b.ts || 0)-(a.ts || 0));

    return {
      items:unique,
      liveSources,
      failedSources
    };
  }

  W.ZZXBTCIntelSources = Object.freeze({
    __version:1,
    REPOS,
    market,
    githubRepo,
    discussion,
    feed
  });
})();
