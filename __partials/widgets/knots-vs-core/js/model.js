(function(){
  "use strict";
  const W=window;
  if(W.ZZXKnotsCoreModel?.__version>=4)return;

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function text(v){return String(v??"").trim()}

  function classifyAgent(agent,familyHint=""){
    const hint=text(familyHint);
    if(hint==="Bitcoin Knots")return "knots";
    if(hint==="Bitcoin Core")return "core";
    const s=text(agent).toLowerCase();
    if(s.includes("knots"))return "knots";
    if(s.includes("/satoshi:")||s.includes("satoshi:")||s.includes("bitcoin core"))return "core";
    return "other";
  }

  function normalizeVersionRows(versionData,snapshot){
    const direct=Array.isArray(versionData?.rows)?versionData.rows:[];
    if(direct.length){
      return direct.map(row=>({
        userAgent:text(row.userAgent??row.label)||"Unknown",
        family:text(row.family)||null,
        version:text(row.version)||"Unknown",
        count:finite(row.count)
      })).filter(row=>Number.isFinite(row.count)&&row.count>0);
    }

    const byVersion=snapshot?.byVersion;
    if(byVersion&&typeof byVersion==="object"&&!Array.isArray(byVersion)){
      return Object.entries(byVersion).map(([ua,count])=>({
        userAgent:text(ua)||"Unknown",
        family:null,
        version:"Unknown",
        count:finite(count)
      })).filter(row=>Number.isFinite(row.count)&&row.count>0);
    }
    return [];
  }

  function torCounts(snapshot){
    const out={core:0,knots:0,other:0,total:0,available:false};
    const nodes=Array.isArray(snapshot?.nodes)?snapshot.nodes:[];
    if(!nodes.length)return out;
    out.available=true;
    for(const node of nodes){
      const network=text(node?.network).toLowerCase();
      const address=text(node?.address).toLowerCase();
      if(network!=="tor"&&!address.includes(".onion"))continue;
      const bucket=classifyAgent(node?.userAgent);
      out[bucket]+=1;out.total+=1;
    }
    return out;
  }

  function unreachableFromRaw(raw){
    const candidates=[
      raw?.unreachable_nodes,
      raw?.unreachable,
      raw?.counts?.unreachable,
      raw?.network_counts?.unreachable,
      raw?.data?.unreachable_nodes,
      raw?.data?.counts?.unreachable
    ];
    for(const value of candidates){
      const n=finite(value);
      if(Number.isFinite(n)&&n>=0)return n;
    }
    return NaN;
  }

  function build(versionData,snapshot,raw){
    const rows=normalizeVersionRows(versionData,snapshot);
    const identified=rows.reduce((sum,row)=>sum+row.count,0);
    const reachable=finite(snapshot?.reachableNodes??snapshot?.totalNodes??versionData?.reachable);
    const denominator=Number.isFinite(reachable)&&reachable>0?reachable:identified;

    let core=0,knots=0,otherIdentified=0;
    const exact=[];
    for(const row of rows){
      const bucket=classifyAgent(row.userAgent,row.family);
      if(bucket==="core")core+=row.count;
      else if(bucket==="knots")knots+=row.count;
      else otherIdentified+=row.count;

      if(bucket!=="other"){
        exact.push(Object.freeze({
          ...row,
          family:bucket==="core"?"Bitcoin Core":"Bitcoin Knots",
          bucket,
          shareIdentified:identified>0?row.count/identified:NaN,
          shareNetwork:denominator>0?row.count/denominator:NaN
        }));
      }
    }

    const unidentifiedReachable=denominator>identified?denominator-identified:0;
    const other=otherIdentified+unidentifiedReachable;
    const identifiedCoreKnots=core+knots;
    const tor=torCounts(snapshot);

    exact.sort((a,b)=>b.count-a.count||a.family.localeCompare(b.family)||a.userAgent.localeCompare(b.userAgent));

    return Object.freeze({
      schema:"zzx-knots-vs-core-model-v4",
      total:denominator,
      reachable:Number.isFinite(reachable)?reachable:denominator,
      identified,
      coverage:denominator>0?Math.min(1,identified/denominator):NaN,
      core,knots,other,otherIdentified,unidentifiedReachable,
      corePct:denominator>0?core/denominator:NaN,
      knotsPct:denominator>0?knots/denominator:NaN,
      otherPct:denominator>0?other/denominator:NaN,
      coreVsKnots:identifiedCoreKnots>0?core/identifiedCoreKnots:NaN,
      knotsVsCore:identifiedCoreKnots>0?knots/identifiedCoreKnots:NaN,
      torCore:tor.available?tor.core:NaN,
      torKnots:tor.available?tor.knots:NaN,
      torOther:tor.available?tor.other:NaN,
      torTotal:tor.available?tor.total:NaN,
      unreachable:unreachableFromRaw(raw),
      exactRows:Object.freeze(exact)
    });
  }

  W.ZZXKnotsCoreModel=Object.freeze({__version:4,classifyAgent,normalizeVersionRows,torCounts,build});
})();
