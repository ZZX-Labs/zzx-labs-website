
// __partials/widgets/btc-repo/js/provider.js
(function () {
  "use strict";

  const W=window;
  if(Number(W.ZZXRepoProvider?.__version||0)>=2)return;

  const REPOS=Object.freeze([
    {id:"core",repo:"bitcoin/bitcoin",label:"Bitcoin Core"},
    {id:"bips",repo:"bitcoin/bips",label:"BIPs"},
    {id:"bolts",repo:"lightning/bolts",label:"BOLTs"},
    {id:"lnd",repo:"lightningnetwork/lnd",label:"LND"}
  ]);

  const cache=new Map();
  const inflight=new Map();

  function resolved(url){
    return W.ZZXAPI?.url&&!/^https?:/i.test(url)?W.ZZXAPI.url(url):url;
  }

  async function getJSON(url,github=false){
    const target=resolved(url);
    const local=!/^https?:/i.test(target);

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        headers:github
          ? {"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
          : {Accept:"application/json"},
        timeoutMs:12000,
        retries:1,
        retryDelayMs:450
      });
      return r.json();
    }

    const r=await fetch(target,{
      cache:"no-store",
      credentials:local?"same-origin":"omit",
      headers:github
        ? {"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
        : {Accept:"application/json"}
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

  function base(spec){
    return `/bitcoin/github/api/repos/${spec.repo}`;
  }

  function unwrapMeta(payload){
    return payload?.repository||payload?.repo||payload||{};
  }

  function unwrapCommits(payload){
    return Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.commits)
        ? payload.commits
        : [];
  }

  function unwrapReleases(payload){
    return Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.releases)
        ? payload.releases
        : [];
  }

  function normalize(spec,metaPayload,commitPayload,releasePayload,transport,partial){
    const meta=unwrapMeta(metaPayload);
    const commits=unwrapCommits(commitPayload);
    const releases=unwrapReleases(releasePayload);

    return {
      spec,
      transport,
      meta:{
        stars:Number(meta?.stargazers_count),
        forks:Number(meta?.forks_count),
        issues:Number(meta?.open_issues_count),
        branch:String(meta?.default_branch||"—"),
        updatedAt:Date.parse(meta?.updated_at||"")||0,
        htmlUrl:meta?.html_url||`https://github.com/${spec.repo}`
      },
      commits:commits.map(c=>({
        sha:String(c?.sha||""),
        message:String(c?.commit?.message||c?.message||"repository update").split("\n")[0].slice(0,180),
        url:c?.html_url||c?.url||`https://github.com/${spec.repo}`,
        author:String(c?.commit?.author?.name||c?.author?.login||c?.author_name||"unknown"),
        ts:Date.parse(c?.commit?.author?.date||c?.date||"")||0
      })),
      release:releases[0]?{
        name:String(releases[0]?.name||releases[0]?.tag_name||"release"),
        tag:String(releases[0]?.tag_name||""),
        url:releases[0]?.html_url||`https://github.com/${spec.repo}/releases`,
        ts:Date.parse(releases[0]?.published_at||releases[0]?.created_at||"")||0
      }:null,
      partial:Boolean(partial)
    };
  }

  async function loadLocal(spec){
    const root=base(spec);
    const [metaResult,commitResult,releaseResult]=await Promise.allSettled([
      getJSON(`${root}/repo.json`),
      getJSON(`${root}/commits.json`),
      getJSON(`${root}/releases.json`)
    ]);

    // Existing Bitcoin-Core mirror compatibility.
    let metaResult2=metaResult;
    let commitResult2=commitResult;

    if(spec.id==="core"&&metaResult.status==="rejected"){
      metaResult2=await Promise.resolve(
        getJSON("/bitcoin/github/api/bitcoin-core/repo.json")
      ).then(value=>({status:"fulfilled",value}),reason=>({status:"rejected",reason}));
    }

    if(spec.id==="core"&&commitResult.status==="rejected"){
      commitResult2=await Promise.resolve(
        getJSON("/bitcoin/github/api/bitcoin-core/commits.json")
      ).then(value=>({status:"fulfilled",value}),reason=>({status:"rejected",reason}));
    }

    if(metaResult2.status==="rejected"&&commitResult2.status==="rejected"){
      throw metaResult2.reason||commitResult2.reason||new Error("repository mirror unavailable");
    }

    return normalize(
      spec,
      metaResult2.status==="fulfilled"?metaResult2.value:{},
      commitResult2.status==="fulfilled"?commitResult2.value:[],
      releaseResult.status==="fulfilled"?releaseResult.value:[],
      "local mirror",
      metaResult2.status!=="fulfilled"||
      commitResult2.status!=="fulfilled"||
      releaseResult.status!=="fulfilled"
    );
  }

  async function loadDirect(spec){
    const gh=`https://api.github.com/repos/${spec.repo}`;

    const [metaResult,commitResult,releaseResult]=await Promise.allSettled([
      getJSON(gh,true),
      getJSON(`${gh}/commits?per_page=5`,true),
      getJSON(`${gh}/releases?per_page=1`,true)
    ]);

    if(metaResult.status==="rejected"&&commitResult.status==="rejected"){
      throw metaResult.reason||commitResult.reason||new Error("repository unavailable");
    }

    return normalize(
      spec,
      metaResult.status==="fulfilled"?metaResult.value:{},
      commitResult.status==="fulfilled"?commitResult.value:[],
      releaseResult.status==="fulfilled"?releaseResult.value:[],
      "direct GitHub",
      metaResult.status!=="fulfilled"||
      commitResult.status!=="fulfilled"||
      releaseResult.status!=="fulfilled"
    );
  }

  async function load(spec,force=false){
    return cached(`repo:${spec.repo}`,60000,async()=>{
      try{
        return await loadLocal(spec);
      }catch(localError){
        if(W.ZZXGitHubDirectFallback!==true)throw localError;
        return loadDirect(spec);
      }
    },force);
  }

  W.ZZXRepoProvider=Object.freeze({
    __version:2,
    REPOS,
    load
  });
})();
