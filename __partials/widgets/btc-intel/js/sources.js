
// __partials/widgets/btc-intel/js/sources.js
(function () {
  "use strict";

  const W=window;
  if(Number(W.ZZXBTCIntelSources?.__version||0)>=2)return;

  const REPOS=Object.freeze([
    {repo:"bitcoin/bitcoin",category:"protocol",label:"Core"},
    {repo:"bitcoin/bips",category:"protocol",label:"BIPs"},
    {repo:"lightning/bolts",category:"lightning",label:"BOLTs"},
    {repo:"lightningnetwork/lnd",category:"lightning",label:"LND"}
  ]);

  const HN_LOCAL="/bitcoin/intel/api/news/hn.json";
  const HN_DIRECT="https://hn.algolia.com/api/v1/search?"+
    new URLSearchParams({
      query:"bitcoin OR satoshi OR lightning OR bips",
      tags:"story",
      hitsPerPage:"12"
    }).toString();

  const cache=new Map();
  const inflight=new Map();

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)?W.ZZXAPI.url(url):url;
  }

  async function fetchJSON(url){
    const target=resolved(url);
    const local=!/^https?:/i.test(target);

    if(W.ZZXAPI?.jsonStrict){
      return W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:10000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs:10000,
        retries:1
      });
      return r.json();
    }

    const r=await fetch(target,{
      cache:"no-store",
      credentials:local?"same-origin":"omit",
      headers:/api\.github\.com/i.test(target)
        ? {"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
        : undefined
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${target}`);
    return r.json();
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

  async function market(force=false){
    return cached("market",15000,async()=>{
      const data=await fetchJSON("/bitcoin/bpi/api/latest.json");
      return {data,source:data?.source||"ZZX Global BPI"};
    },force);
  }

  function repoPath(repo){
    return `/bitcoin/github/api/repos/${repo}/commits.json`;
  }

  function commitRows(payload,spec){
    const rows=Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.commits)
        ? payload.commits
        : [];

    return rows.slice(0,3).map(c=>({
      id:`gh:${spec.repo}:${c?.sha||""}`,
      category:spec.category,
      source:spec.label,
      title:String(c?.commit?.message||c?.message||"repository update").split("\n")[0].slice(0,150),
      detail:spec.repo,
      url:c?.html_url||c?.url||`https://github.com/${spec.repo}`,
      ts:Date.parse(c?.commit?.author?.date||c?.date||"")||0
    }));
  }

  async function githubRepo(spec,force=false){
    return cached(`gh:${spec.repo}`,60000,async()=>{
      try{
        const data=await fetchJSON(repoPath(spec.repo));
        return {
          items:commitRows(data,spec),
          source:`Mirror ${spec.repo}`
        };
      }catch(localError){
        if(W.ZZXGitHubDirectFallback!==true)throw localError;

        const data=await fetchJSON(
          `https://api.github.com/repos/${spec.repo}/commits?per_page=3`
        );

        return {
          items:commitRows(data,spec),
          source:`GitHub ${spec.repo}`
        };
      }
    },force);
  }

  function hnRows(payload){
    if(Array.isArray(payload?.items)){
      return payload.items.slice(0,10).map(item=>({
        id:String(item.id||""),
        category:"discussion",
        source:"HN",
        title:String(item.title||"discussion"),
        detail:String(item.detail||""),
        url:String(item.url||""),
        ts:Number(item.ts||0)
      })).filter(item=>item.title&&item.url);
    }

    const hits=Array.isArray(payload?.hits)?payload.hits:[];
    return hits.slice(0,10).map(h=>({
      id:`hn:${h?.objectID||""}`,
      category:"discussion",
      source:"HN",
      title:h?.title||h?.story_title||"discussion",
      detail:`${Number(h?.points||0).toLocaleString()} points · ${Number(h?.num_comments||0).toLocaleString()} comments`,
      url:h?.url||h?.story_url||`https://news.ycombinator.com/item?id=${h?.objectID}`,
      ts:Number(h?.created_at_i||0)*1000
    })).filter(item=>item.title&&item.url);
  }

  async function discussion(force=false){
    return cached("hn",60000,async()=>{
      try{
        const data=await fetchJSON(HN_LOCAL);
        const items=hnRows(data);
        if(items.length)return {items,source:"HN local mirror"};
      }catch(_){}

      const data=await fetchJSON(HN_DIRECT);
      return {items:hnRows(data),source:"Hacker News / Algolia"};
    },force);
  }

  async function feed(force=false){
    const results=await Promise.allSettled([
      ...REPOS.map(spec=>githubRepo(spec,force)),
      discussion(force)
    ]);

    const items=[];
    const liveSources=[];
    const failedSources=[];

    results.forEach((result,index)=>{
      if(result.status==="fulfilled"){
        liveSources.push(result.value.source);
        items.push(...(result.value.items||[]));
      }else{
        failedSources.push(index<REPOS.length?REPOS[index].label:"HN");
      }
    });

    const seen=new Set();
    const unique=items.filter(item=>{
      const key=item.id||`${item.source}:${item.title}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>(b.ts||0)-(a.ts||0));

    return {items:unique,liveSources,failedSources};
  }

  W.ZZXBTCIntelSources=Object.freeze({
    __version:2,
    REPOS,
    SOURCE_COUNT:REPOS.length+1,
    market,
    githubRepo,
    discussion,
    feed
  });
})();
