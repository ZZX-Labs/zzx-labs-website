(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCCommitsFetch?.__version>=1)return;
  function resolved(url){return W.ZZXAPI?.url&&!/^https?:/i.test(url)?W.ZZXAPI.url(url):url}
  async function raw(url){
    const target=resolved(url);
    const r=await fetch(target,{cache:"no-store",credentials:/^https?:/i.test(target)?"omit":"same-origin",headers:/api\.github\.com/i.test(target)?{"Accept":"application/vnd.github+json"}:undefined});
    if(!r.ok){const e=new Error(`HTTP ${r.status}`);e.status=r.status;throw e}
    return r;
  }
  const retryable=e=>{const s=Number(e?.status);return !Number.isFinite(s)||s===0||s===408||s===429||s>=500};
  async function json(url){return await (await raw(url)).json()}
  async function load(){
    const S=W.ZZXBTCCommitsSources;
    try{return {payload:await json(S.local),source:"ZZX local Bitcoin Core commits mirror",transport:"local"}}
    catch(_){
      try{return {payload:await json(S.github),source:"GitHub · bitcoin/bitcoin",transport:"direct"}}
      catch(e){if(!retryable(e))throw e;return {payload:await json(S.allOrigins+encodeURIComponent(S.github)),source:"GitHub · bitcoin/bitcoin",transport:"AllOrigins CORS fallback"}}
    }
  }
  W.ZZXBTCCommitsFetch=Object.freeze({__version:1,load});
})();
