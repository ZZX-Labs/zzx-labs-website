// __partials/widgets/btc-repo/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXRepoProvider?.__version >= 1) return;

  const GH="https://api.github.com";

  const REPOS=Object.freeze([
    {id:"core",repo:"bitcoin/bitcoin",label:"Bitcoin Core"},
    {id:"bips",repo:"bitcoin/bips",label:"BIPs"},
    {id:"bolts",repo:"lightning/bolts",label:"BOLTs"},
    {id:"lnd",repo:"lightningnetwork/lnd",label:"LND"}
  ]);

  const cache=new Map();
  const inflight=new Map();

  async function getJSON(url) {
    if (W.ZZXAPI?.fetchRaw) {
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        headers:{Accept:"application/vnd.github+json"},
        timeoutMs:12000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:"omit",
      headers:{Accept:"application/vnd.github+json"}
    });

    if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
    return await r.json();
  }

  async function cached(key,ttl,loader,force=false) {
    const hit=cache.get(key);

    if (!force && hit && Date.now()-hit.at<ttl) return hit.value;
    if (inflight.has(key)) return await inflight.get(key);

    const promise=Promise.resolve()
      .then(loader)
      .then(value=>{
        cache.set(key,{at:Date.now(),value});
        return value;
      })
      .finally(()=>inflight.delete(key));

    inflight.set(key,promise);
    return await promise;
  }

  async function load(spec,force=false) {
    const key=`repo:${spec.repo}`;

    return await cached(key,60000,async()=>{
      const [metaResult,commitResult,releaseResult]=await Promise.allSettled([
        getJSON(`${GH}/repos/${spec.repo}`),
        getJSON(`${GH}/repos/${spec.repo}/commits?per_page=5`),
        getJSON(`${GH}/repos/${spec.repo}/releases?per_page=1`)
      ]);

      if (metaResult.status==="rejected" && commitResult.status==="rejected") {
        throw metaResult.reason || commitResult.reason || new Error("repository unavailable");
      }

      const meta=metaResult.status==="fulfilled" ? metaResult.value : {};
      const commits=commitResult.status==="fulfilled" && Array.isArray(commitResult.value)
        ? commitResult.value
        : [];
      const releases=releaseResult.status==="fulfilled" && Array.isArray(releaseResult.value)
        ? releaseResult.value
        : [];

      return {
        spec,
        meta:{
          stars:Number(meta?.stargazers_count),
          forks:Number(meta?.forks_count),
          issues:Number(meta?.open_issues_count),
          branch:String(meta?.default_branch || "—"),
          updatedAt:Date.parse(meta?.updated_at || "") || 0,
          htmlUrl:meta?.html_url || `https://github.com/${spec.repo}`
        },
        commits:commits.map(c=>({
          sha:String(c?.sha || ""),
          message:String(c?.commit?.message || "repository update").split("\n")[0].slice(0,180),
          url:c?.html_url || `https://github.com/${spec.repo}`,
          author:String(
            c?.commit?.author?.name ||
            c?.author?.login ||
            "unknown"
          ),
          ts:Date.parse(c?.commit?.author?.date || "") || 0
        })),
        release:releases[0] ? {
          name:String(releases[0]?.name || releases[0]?.tag_name || "release"),
          tag:String(releases[0]?.tag_name || ""),
          url:releases[0]?.html_url || `https://github.com/${spec.repo}/releases`,
          ts:Date.parse(releases[0]?.published_at || releases[0]?.created_at || "") || 0
        } : null,
        partial:
          metaResult.status!=="fulfilled" ||
          commitResult.status!=="fulfilled" ||
          releaseResult.status!=="fulfilled"
      };
    },force);
  }

  W.ZZXRepoProvider=Object.freeze({
    __version:1,
    REPOS,
    load
  });
})();
