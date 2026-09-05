// __partials/widgets/knots-vs-core/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXKnotsCoreModel?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function classifyAgent(agent){
    const s=String(agent||"").toLowerCase();

    if(s.includes("knots"))return "knots";

    if(
      s.includes("/satoshi:") ||
      s.includes("satoshi:") ||
      s.includes("bitcoin core")
    ){
      return "core";
    }

    return "other";
  }

  function parseAgentRows(rows){
    const out={core:0,knots:0,other:0,total:0};

    for(const row of Array.isArray(rows)?rows:[]){
      if(!row)continue;

      const agent=String(
        row.agent ??
        row.name ??
        row.user_agent ??
        row.label ??
        row[0] ??
        ""
      );

      const count=finite(
        row.count ??
        row.nodes ??
        row.value ??
        row[1]
      );

      if(!Number.isFinite(count)||count<=0)continue;

      const bucket=classifyAgent(agent);
      out[bucket]+=count;
      out.total+=count;
    }

    return out;
  }

  function parseSnapshotNodes(nodes){
    const out={
      core:0,knots:0,other:0,total:0,
      torCore:0,torKnots:0,torOther:0,torTotal:0
    };

    for(const [address,entry] of Object.entries(nodes||{})){
      let ua="";

      if(Array.isArray(entry)){
        ua=String(entry[1]||entry[2]||"");
      }else if(entry&&typeof entry==="object"){
        ua=String(entry.user_agent||entry.agent||entry.subver||"");
      }

      const bucket=classifyAgent(ua);
      out[bucket]+=1;
      out.total+=1;

      if(String(address).toLowerCase().includes(".onion")){
        out.torTotal+=1;
        if(bucket==="core")out.torCore+=1;
        else if(bucket==="knots")out.torKnots+=1;
        else out.torOther+=1;
      }
    }

    return out;
  }

  function finalize(counts,network){
    const c={
      core:finite(counts?.core)||0,
      knots:finite(counts?.knots)||0,
      other:finite(counts?.other)||0,
      total:finite(counts?.total)||0,
      torCore:finite(counts?.torCore),
      torKnots:finite(counts?.torKnots),
      torOther:finite(counts?.torOther),
      torTotal:finite(counts?.torTotal)
    };

    if(!(c.total>0)){
      c.total=c.core+c.knots+c.other;
    }

    if(c.other===0 && c.total>c.core+c.knots){
      c.other=Math.max(0,c.total-c.core-c.knots);
    }

    const denom=c.total>0?c.total:NaN;
    const identified=c.core+c.knots;
    const identifiedDenom=identified>0?identified:NaN;

    return {
      ...c,
      corePct:Number.isFinite(denom)?c.core/denom:NaN,
      knotsPct:Number.isFinite(denom)?c.knots/denom:NaN,
      otherPct:Number.isFinite(denom)?c.other/denom:NaN,
      coreVsKnots:Number.isFinite(identifiedDenom)?c.core/identifiedDenom:NaN,
      knotsVsCore:Number.isFinite(identifiedDenom)?c.knots/identifiedDenom:NaN,
      unreachable:finite(network?.unreachable)
    };
  }

  W.ZZXKnotsCoreModel=Object.freeze({
    __version:3,
    classifyAgent,
    parseAgentRows,
    parseSnapshotNodes,
    finalize
  });
})();
